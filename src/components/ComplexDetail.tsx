import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  TooltipItem,
} from 'chart.js';
import { Card, CardContent, CardHeader } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MapPin, BarChart, ArrowLeft, Calendar, Home } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

console.log('[ComplexDetail] 렌더링됨');

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);

// 단지 정보 타입
export type ComplexInfo = {
  name: string;
  address: string;
  region: string;
  avgPrice: string; // 전체 평균가
  totalDeals: number;
  totalHouseholds: number;
  startDate: string;
  endDate: string;
  areaOptions: string[];
  aptNameOptions: string[];
};

// 면적별 거래 데이터 타입
export type AreaDealData = {
  area: string; // 예: "84㎡"
  prices: { 
    date: string; 
    price: number; 
    rent?: number;
    aptDong?: string; // 동 정보 (빈값일 수 있음)
    floor?: number; // 층 정보
    cdealType?: string; // 계약해제 여부 (매매용)
    contractType?: string; // 계약유형 (전월세용)
    kaptCode?: string; // 아파트 코드 (매매용)
    excluUseAr?: number; // 전용면적 (매매용)
    dealAmount?: number; // 거래금액 (매매용)
  }[]; // 라인차트용 (rent 필드 추가)
};

interface ComplexDetailProps {
  info: ComplexInfo;
  areas: string[]; // 예: ["전체", "59㎡", "84㎡", ...]
  areaDealData: AreaDealData[]; // 면적별 거래 데이터
}

const ComplexDetail: React.FC<ComplexDetailProps> = ({ info, areaDealData }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedArea, setSelectedArea] = React.useState("전체");

  // 날짜 포맷팅 함수
  function formatDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startYear = start.getFullYear();
    const startMonth = start.getMonth() + 1;
    const startDay = start.getDate();
    
    const endYear = end.getFullYear();
    const endMonth = end.getMonth() + 1;
    const endDay = end.getDate();
    
    return `${startYear}년 ${startMonth}월 ${startDay}일 ~ ${endYear}년 ${endMonth}월 ${endDay}일`;
  }

  // 억/천만원 단위 포맷 함수 (천만원 단위까지)
  function formatKoreanPrice(price: number) {
    if (!price) return "-";
    const eok = Math.floor(price / 10000);
    const chun = Math.floor((price % 10000) / 1000) * 1000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += ` ${chun.toLocaleString()}만원`;
    if (eok === 0 && chun === 0) result = `${price.toLocaleString()}만원`;
    return result.trim();
  }

  // 취소 건을 필터링하는 함수
  function filterCancelledDeals(prices: AreaDealData['prices'], isRent: boolean) {
    if (isRent) {
      // 전월세: contractType이 "해제"인 건 제외
      return prices.filter(p => p.contractType !== "해제");
    } else {
      // 매매: 조건1과 조건2에 해당하는 건 제외
      const cancelledKeys = new Set<string>();
      
      // 조건1: cdealType이 Y 또는 O인 건
      prices.forEach(p => {
        if (p.cdealType === 'Y' || p.cdealType === 'O') {
          const key = `${p.kaptCode}_${p.floor}_${p.excluUseAr}_${p.dealAmount}`;
          cancelledKeys.add(key);
        }
      });
      
      // 조건2: 검색기간 내 cdealType이 Y인 데이터가 존재하고 floor, excluUseAr, dealAmount가 동일한 건
      prices.forEach(p => {
        const key = `${p.kaptCode}_${p.floor}_${p.excluUseAr}_${p.dealAmount}`;
        if (cancelledKeys.has(key)) {
          // 해당 키와 동일한 모든 거래를 취소로 판단
          prices.forEach(otherP => {
            if (otherP.floor === p.floor && 
                otherP.excluUseAr === p.excluUseAr && 
                otherP.dealAmount === p.dealAmount) {
              const otherKey = `${otherP.kaptCode}_${otherP.floor}_${otherP.excluUseAr}_${otherP.dealAmount}`;
              cancelledKeys.add(otherKey);
            }
          });
        }
      });
      
      return prices.filter(p => {
        const key = `${p.kaptCode}_${p.floor}_${p.excluUseAr}_${p.dealAmount}`;
        return !cancelledKeys.has(key);
      });
    }
  }

  // 취소 건수를 계산하는 함수
  function countCancelledDeals(prices: AreaDealData['prices'], isRent: boolean) {
    if (isRent) {
      // 전월세: contractType이 "해제"인 건 수
      return prices.filter(p => p.contractType === "해제").length;
    } else {
      // 매매: 조건1과 조건2에 해당하는 건을 1건으로 계산
      const cancelledKeys = new Set<string>();
      

      
      // 조건1: cdealType이 Y 또는 O인 건
      prices.forEach(p => {
        if (p.cdealType === 'Y' || p.cdealType === 'O') {
          const key = `${p.floor}_${p.excluUseAr}_${p.dealAmount}`;
          cancelledKeys.add(key);

        }
      });
      
      // 조건2: 검색기간 내 cdealType이 Y인 데이터가 존재하고 floor, excluUseAr, dealAmount가 동일한 건
      prices.forEach(p => {
        const key = `${p.floor}_${p.excluUseAr}_${p.dealAmount}`;
        if (cancelledKeys.has(key)) {
          // 해당 키와 동일한 모든 거래를 취소로 판단
          prices.forEach(otherP => {
            if (otherP.floor === p.floor && 
                otherP.excluUseAr === p.excluUseAr && 
                otherP.dealAmount === p.dealAmount) {
              const otherKey = `${otherP.floor}_${otherP.excluUseAr}_${otherP.dealAmount}`;
              cancelledKeys.add(otherKey);

            }
          });
        }
      });
      

      return cancelledKeys.size;
    }
  }

  // x축 라벨: 모든 거래 날짜(YYYY-MM-DD)
  const allDates = React.useMemo(() => Array.from(
    new Set(areaDealData.flatMap((a) => a.prices.map((p) => p.date)))
  ).sort(), [areaDealData]);

  // 취소 건을 제외한 데이터
  const filteredAreaDealData = areaDealData.map(area => ({
    ...area,
    prices: filterCancelledDeals(area.prices, false) // 매매 데이터
  }));
  


  // 차트에 표시할 데이터(면적 선택)
  const chartAreas = selectedArea === "전체" ? filteredAreaDealData : filteredAreaDealData.filter((a) => a.area === selectedArea);

  // 선택된 면적의 인덱스 찾기 (색상 일치를 위해)
  const selectedAreaIndex = selectedArea !== "전체" ? filteredAreaDealData.findIndex((a) => a.area === selectedArea) : -1;

  // 전체 평균 가격: 모든 면적 데이터 합산 (취소 건 제외)
  const allPrices = filteredAreaDealData.flatMap((a) => a.prices.map((p) => p.price));
  const overallAvg = allPrices.length ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;

  // 전체 평균 평당가 계산 (만원/평) (취소 건 제외)
  const allPricePerPyeong = filteredAreaDealData.flatMap((a) => {
    if (!a.prices.length || !a.area) return [];
    const areaNumber = parseFloat(a.area.replace('㎡', ''));
    if (isNaN(areaNumber) || areaNumber === 0) return [];
    const pyeong = areaNumber / 3.3058;
    return a.prices.map((p) => p.price / pyeong); // '만원/평'
  });
  const avgPricePerPyeong = allPricePerPyeong.length ? Math.round(allPricePerPyeong.reduce((a, b) => a + b, 0) / allPricePerPyeong.length) : 0;

  // 총 거래건수 (취소 건 제외)
  const totalDeals = allPrices.length;

  // 취소 건수 계산
  const cancelledDealsCount = areaDealData.reduce((total, area) => {
    return total + countCancelledDeals(area.prices, false);
  }, 0);

  // 차트 데이터: 라인은 평균, 점은 모든 거래
  const chartData = {
    labels: allDates,
    datasets: chartAreas.map((area, idx) => {
      // 선택된 면적이 있을 때 해당 면적의 색상 사용, 없으면 기존 색상 사용
      const colorIndex = selectedArea !== "전체" ? selectedAreaIndex : idx;
      const baseColor = `hsl(${(colorIndex * 120) % 360}, 70%, 55%)`;
      
      // 라인용 데이터: 날짜별 평균 계산
      const lineData = allDates.map((date) => {
        const sameDatePrices = area.prices.filter((p) => p.date === date);
        if (sameDatePrices.length === 0) {
          return null; // 해당 날짜에 거래가 없으면 null
        } else {
          // 평균 계산
          const avgPrice = sameDatePrices.reduce((sum, p) => sum + p.price, 0) / sameDatePrices.length;
          return Math.round(avgPrice);
        }
      });
      
      return {
        label: area.area,
        data: lineData,
        borderColor: baseColor,
        backgroundColor: `hsla(${(colorIndex * 120) % 360}, 70%, 80%, 0.18)`,
        pointBackgroundColor: baseColor,
        pointBorderColor: '#fff',
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 3,
        tension: 0.45,
        fill: true,
        spanGaps: true,
      };
    }),
  };

  // 차트 옵션: x축 라벨은 월 단위(1일만), 툴팁은 일 단위
  const chartOptions = React.useMemo(() => ({
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#222',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => {
            // 항상 일 단위로 상세 표시
            const date = items[0].label; // YYYY-MM-DD
            const [year, month, day] = date.split('-');
            return `${year}년 ${month}월 ${day}일`;
          },
        },
      },
    },
  }), []);

  // 면적별 평균 가격과 평단가
  function getAreaAvgPrice(areaData: AreaDealData): number {
    if (!areaData.prices.length) return 0;
    const sum = areaData.prices.reduce((acc, cur) => acc + cur.price, 0);
    return Math.round(sum / areaData.prices.length);
  }
  
  function getAreaAvgPricePerPyeong(areaData: AreaDealData): number {
    if (!areaData.prices.length || !areaData.area) return 0;
    const areaNumber = parseFloat(areaData.area.replace('㎡', ''));
    if (isNaN(areaNumber) || areaNumber === 0) return 0;
    const avgPrice = areaData.prices.reduce((acc, cur) => acc + cur.price, 0) / areaData.prices.length; // '만원' 단위
    const pyeong = areaNumber / 3.3058;
    return Math.round(avgPrice / pyeong); // '만원/평'
  }
  
  const areaAvgList = filteredAreaDealData.map((area) => ({
    area: area.area,
    avg: getAreaAvgPrice(area),
    avgPerPyeong: getAreaAvgPricePerPyeong(area),
    count: area.prices.length,
  }));

  // 전체 데이터 날짜 기준으로 x축 고정 (useMemo로 선언)
  // x축 라벨은 데이터 개수에 따라 유동적으로 - 현재 사용하지 않음
  // const xLabels = React.useMemo(() => allDates.map(d => {
  //   const [y, m, dd] = d.split('-');
  //   return `${y}년 ${Number(m)}월 ${Number(dd)}일`;
  // }), [allDates]);

  // region, address를 합쳐 전체 주소 생성 (지번이 있으면 포함)
  const fullAddress = `${info.region} ${info.address}`.trim();

  // 주소 관련 콘솔 로그 (컴포넌트 렌더링 시마다)
  React.useEffect(() => {
    console.log('[ComplexDetail] info.region:', info.region);
    console.log('[ComplexDetail] info.address:', info.address);
    console.log('[ComplexDetail] fullAddress:', fullAddress);
  }, [info.region, info.address, fullAddress]);

  // dealType이 rent(전월세)인지 판별
  const dealType = searchParams.get('dealType');

  // 전세(보증금, 월세 0)만 필터링
  const isRent = dealType === 'rent';
  

  
  // 전월세 데이터에서 월세가 0인 전세 데이터만 필터링
  let jeonseAreaDealData = areaDealData;
  
  if (isRent) {
    // 전세만 필터링 (rent가 0 또는 undefined인 데이터만)
    jeonseAreaDealData = areaDealData.map(area => ({
      ...area,
      prices: area.prices.filter(p => p.price > 0 && (p.rent === 0 || p.rent === undefined)),
    })).filter(area => area.prices.length > 0);
  }

  // 취소 건을 제외한 전월세 데이터
  const filteredJeonseAreaDealData = jeonseAreaDealData.map(area => ({
    ...area,
    prices: filterCancelledDeals(area.prices, true) // 전월세 데이터
  }));

  // 전월세 취소 건수 계산
  const jeonseCancelledDealsCount = jeonseAreaDealData.reduce((total, area) => {
    return total + countCancelledDeals(area.prices, true);
  }, 0);

  // 전체 전세 보증금 평균 (취소 건 제외)
  const jeonseAllPrices = isRent
    ? filteredJeonseAreaDealData.flatMap((a) => a.prices.map((p) => p.price))
    : filteredAreaDealData.flatMap((a) => a.prices.map((p) => p.price));
  const jeonseOverallAvg = jeonseAllPrices.length ? Math.round(jeonseAllPrices.reduce((a, b) => a + b, 0) / jeonseAllPrices.length) : 0;

  // 전체 전세 평당가 평균 (만원/평) (취소 건 제외)
  const jeonseAllPricePerPyeong = (isRent ? filteredJeonseAreaDealData : filteredAreaDealData).flatMap((a) => {
    if (!a.prices.length || !a.area) return [];
    const areaNumber = parseFloat(a.area.replace('㎡', ''));
    if (isNaN(areaNumber) || areaNumber === 0) return [];
    const pyeong = areaNumber / 3.3058;
    return a.prices.map((p) => p.price / pyeong); // '만원/평'
  });
  const jeonseAvgPricePerPyeong = jeonseAllPricePerPyeong.length ? Math.round(jeonseAllPricePerPyeong.reduce((a, b) => a + b, 0) / jeonseAllPricePerPyeong.length) : 0;

  // 전세 거래건수 (월세 0인 거래만, 취소 건 제외)
  const jeonseTotalDeals = jeonseAllPrices.length;
  
  // 전체 거래건수 (전세 + 월세 모두 포함, 취소 건 제외)
  const allTotalDeals = isRent 
    ? filteredJeonseAreaDealData.flatMap((a) => a.prices.map((p) => p.price)).length
    : totalDeals;

  // 면적별 평균 전세 보증금과 평단가
  function getJeonseAreaAvgPrice(areaData: AreaDealData): number {
    if (!areaData.prices.length) return 0;
    const sum = areaData.prices.reduce((acc, cur) => acc + cur.price, 0);
    return Math.round(sum / areaData.prices.length);
  }
  
  function getJeonseAreaAvgPricePerPyeong(areaData: AreaDealData): number {
    if (!areaData.prices.length || !areaData.area) return 0;
    const areaNumber = parseFloat(areaData.area.replace('㎡', ''));
    if (isNaN(areaNumber) || areaNumber === 0) return 0;
    const avgPrice = areaData.prices.reduce((acc, cur) => acc + cur.price, 0) / areaData.prices.length; // '만원' 단위
    const pyeong = areaNumber / 3.3058;
    return Math.round(avgPrice / pyeong); // '만원/평'
  }
  
  const jeonseAreaAvgList = filteredJeonseAreaDealData.map((area) => ({
    area: area.area,
    avg: getJeonseAreaAvgPrice(area),
    avgPerPyeong: getJeonseAreaAvgPricePerPyeong(area),
    count: area.prices.length,
  }));

  // 차트 데이터: 전세(월세 0)만 사용
  const jeonseAllDates = React.useMemo(() => Array.from(
    new Set(filteredJeonseAreaDealData.flatMap((a) => a.prices.map((p) => p.date)))
  ).sort(), [filteredJeonseAreaDealData]);
  const jeonseChartAreas = selectedArea === "전체" ? filteredJeonseAreaDealData : filteredJeonseAreaDealData.filter((a) => a.area === selectedArea);
  
  // 전월세에서 선택된 면적의 인덱스 찾기 (색상 일치를 위해)
  const jeonseSelectedAreaIndex = selectedArea !== "전체" ? filteredJeonseAreaDealData.findIndex((a) => a.area === selectedArea) : -1;
  
  const jeonseChartData = {
    labels: jeonseAllDates,
    datasets: jeonseChartAreas.map((area, idx) => {
      // 선택된 면적이 있을 때 해당 면적의 색상 사용, 없으면 기존 색상 사용
      const colorIndex = selectedArea !== "전체" ? jeonseSelectedAreaIndex : idx;
      const baseColor = `hsl(${(colorIndex * 120) % 360}, 70%, 55%)`;
      
      // 라인용 데이터: 날짜별 평균 계산
      const lineData = jeonseAllDates.map((date) => {
        const sameDatePrices = area.prices.filter((p) => p.date === date);
        if (sameDatePrices.length === 0) {
          return null; // 해당 날짜에 거래가 없으면 null
        } else {
          // 평균 계산
          const avgPrice = sameDatePrices.reduce((sum, p) => sum + p.price, 0) / sameDatePrices.length;
          return Math.round(avgPrice);
        }
      });
      
      return {
        label: area.area,
        data: lineData,
        borderColor: baseColor,
        backgroundColor: `hsla(${(colorIndex * 120) % 360}, 70%, 80%, 0.18)`,
        pointBackgroundColor: baseColor,
        pointBorderColor: '#fff',
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 3,
        tension: 0.45,
        fill: true,
        spanGaps: true,
      };
    }),
  };

  // 차트 렌더링 직전 진단용 로그
  console.log('[전월세] jeonseChartData', jeonseChartData);
  console.log('[전월세] 차트 렌더링 조건:', jeonseChartAreas.length > 0, jeonseAllDates.length > 0);

  // 전월세 차트 옵션: 전월세 데이터에 맞게 조절
  const jeonseChartOptions = React.useMemo(() => ({
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#222',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => {
            // 항상 일 단위로 상세 표시
            const date = items[0].label; // YYYY-MM-DD
            const [year, month, day] = date.split('-');
            return `${year}년 ${month}월 ${day}일`;
          },
        },
      },
    },
  }), []);

  // 진단용 콘솔 로그 (전월세일 때만)
  React.useEffect(() => {
    if (isRent) {
      console.log('[ComplexDetail] isRent:', isRent, 'dealType:', dealType);
      console.log('[전월세] areaDealData', areaDealData);
      console.log('[전월세] jeonseAreaDealData', jeonseAreaDealData);
      console.log('[전월세] jeonseChartAreas', jeonseChartAreas);
      console.log('[전월세] jeonseAllDates', jeonseAllDates);
      console.log('[전월세] selectedArea', selectedArea);
    }
  }, [isRent, areaDealData, jeonseAreaDealData, jeonseChartAreas, jeonseAllDates, selectedArea, dealType]);

  if (isRent) {
    // 전월세(전세) UI 렌더링
    return (
      <Card className="w-full ml-0 mt-0 p-1 md:mx-0 md:max-w-none md:mt-0 md:p-0 rounded-md md:rounded-2xl">
        <CardHeader className="pb-1 pt-1 px-1 md:pb-2 md:pt-4 md:px-2">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              aria-label="뒤로가기"
              className="block md:hidden p-1 rounded hover:bg-gray-100 active:bg-gray-200 transition"
              onClick={() => router.replace(`/region?${searchParams.toString()}`)}
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <h2 className="text-xl md:text-2xl font-bold flex items-center gap-1 md:gap-2">
              {info.name}
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
              <Calendar className="w-3 h-3 text-gray-500" />
              <span>조회기간 {formatDateRange(info.startDate, info.endDate)}</span>
            </div>
          </div>
          <a
            href={`https://map.naver.com/v5/search/${encodeURIComponent(fullAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-xs md:text-sm text-primary font-medium mt-0 mb-1 hover:underline hover:text-green-700 transition cursor-pointer"
            style={{ width: 'fit-content' }}
          >
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
            {fullAddress}
          </a>
          {/* 모바일: 상단 정보 표 */}
          <div className="block md:hidden w-full mb-1 px-0">
            <table className="w-full text-xs border rounded overflow-hidden bg-white">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-1 font-semibold text-gray-700">평균 전세 보증금</th>
                  <th className="py-3 px-1 font-semibold text-gray-700">평당 평균 전세 보증금</th>
                  <th className="py-3 px-1 font-semibold text-gray-700">총 거래건수</th>
                  {cancelledDealsCount > 0 && (
                    <th className="py-3 px-1 font-semibold text-gray-700">취소건수</th>
                  )}
                  <th className="py-3 px-1 font-semibold text-gray-700">총세대수</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 px-1 text-center font-bold text-blue-700">{formatKoreanPrice(jeonseOverallAvg)}</td>
                  <td className="py-3 px-1 text-center font-bold text-orange-700">{jeonseAvgPricePerPyeong.toLocaleString()}만원/평</td>
                  <td className="py-3 px-1 text-center font-bold text-green-700">{(isRent ? allTotalDeals : jeonseTotalDeals).toLocaleString()}건</td>
                  {cancelledDealsCount > 0 && (
                    <td className="py-3 px-1 text-center font-bold text-red-600">취소 {(isRent ? jeonseCancelledDealsCount : cancelledDealsCount).toLocaleString()}건</td>
                  )}
                  <td className="py-3 px-1 text-center font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* 데스크톱: 카드형 */}
          <div className="hidden md:flex flex-col md:flex-row gap-1.5 md:gap-4 mt-3 md:mt-6 w-full overflow-x-auto pb-2">
            <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
              <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-blue-500" />
              <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">평균 전세 보증금</div>
              <div className="text-sm md:text-lg font-bold text-blue-700">{formatKoreanPrice(jeonseOverallAvg)}</div>
            </div>
            <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
              <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-orange-500" />
              <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">평당 평균 전세 보증금</div>
              <div className="text-sm md:text-lg font-bold text-orange-700">{jeonseAvgPricePerPyeong.toLocaleString()}만원/평</div>
            </div>
            <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
              <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-green-500" />
              <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">총 거래 건수</div>
              <div className="text-sm md:text-lg font-bold text-green-700">{(isRent ? allTotalDeals : jeonseTotalDeals).toLocaleString()}건</div>
              {(isRent ? jeonseCancelledDealsCount : cancelledDealsCount) > 0 && (
                <div className="text-[10px] md:text-xs font-bold text-red-600">취소 {(isRent ? jeonseCancelledDealsCount : cancelledDealsCount).toLocaleString()}건</div>
              )}
            </div>
            {/* <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
              <Home className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-purple-500" />
              <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">총세대수</div>
              <div className="text-sm md:text-lg font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</div>
            </div> */}
          </div>
        </CardHeader>
        <CardContent className="px-2 md:px-2">
          {/* 모바일: 표 형태 */}
          <div className="mb-1 block md:hidden px-0">
            <div className="font-semibold mb-0.5">면적별 평균 전세 보증금액</div>
            <table className="w-full text-xs border rounded overflow-hidden bg-white">
              <thead>
                <tr className="bg-gray-100">
                  <th className="py-3 px-1 font-semibold text-gray-700">면적(㎡)</th>
                  <th className="py-3 px-1 font-semibold text-gray-700">평균 전세 보증금</th>
                  <th className="py-3 px-1 font-semibold text-gray-700">평단가</th>
                  <th className="py-3 px-1 font-semibold text-gray-700">거래수</th>
                </tr>
              </thead>
              <tbody>
                {jeonseAreaAvgList.map((row) => (
                  <tr key={row.area} className="border-t last:border-b">
                    <td className="py-3 px-1 text-center">{row.area}</td>
                    <td className="py-3 px-1 text-center font-bold text-primary">{formatKoreanPrice(row.avg)}</td>
                    <td className="py-3 px-1 text-center font-bold text-orange-600">{row.avgPerPyeong.toLocaleString()}만원/평</td>
                    <td className="py-3 px-1 text-center text-gray-600">{row.count}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 데스크톱: 카드형 */}
          <div className="mb-6 hidden md:block">
            <div className="font-semibold mb-2">면적별 평균 전세 보증금액</div>
            <div className="flex gap-1.5 md:gap-4 overflow-x-auto pb-2">
              {jeonseAreaAvgList.map((row, idx) => (
                <div
                  key={row.area}
                  className="min-w-[80px] max-w-[100px] md:min-w-[120px] md:max-w-[160px] flex-shrink-0"
                >
                  <Card className="shadow-sm border-2 border-muted p-2 md:p-3 flex flex-col items-center" style={{ borderColor: `hsl(${(idx * 120) % 360}, 70%, 55%)` }}>
                    <div className="text-[11px] md:text-xs font-semibold mb-0.5 md:mb-1">{row.area}㎡</div>
                    <div className="text-xs md:text-base font-bold text-primary mb-0.5 md:mb-1">{formatKoreanPrice(row.avg)}</div>
                    <div className="text-[10px] md:text-[11px] font-bold text-orange-600 mb-0.5">{row.avgPerPyeong.toLocaleString()}만원/평</div>
                    <div className="text-[10px] md:text-[11px] text-gray-500">{row.count}건</div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
          {/* Area Select for Rent */}
          <div className="flex items-center gap-4 mb-4">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="면적" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {jeonseAreaDealData.map((area) => (
                  <SelectItem key={area.area} value={area.area}>
                    {area.area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* 전월세 차트 영역 */}
          <div className="w-full h-56 md:h-96 flex items-center justify-start rounded-md border mt-1 md:mt-2" style={{ background: '#f5f7fa' }}>
            {jeonseChartAreas.length > 0 && jeonseAllDates.length > 0 ? (
              <Line data={jeonseChartData} options={jeonseChartOptions} />
            ) : (
              <span className="text-muted-foreground">[거래 데이터 없음]</span>
            )}
          </div>
          {/* 범례 for Rent */}
          <div className="flex gap-4 mt-2">
            {jeonseChartAreas.map((area, idx) => {
              // 선택된 면적이 있을 때 해당 면적의 색상 사용, 없으면 기존 색상 사용
              const colorIndex = selectedArea !== "전체" ? jeonseSelectedAreaIndex : idx;
              
              return (
                <div key={area.area} className="flex items-center gap-1 text-xs">
                  <span 
                    className="inline-block w-3 h-1.5 rounded-full" 
                    style={{ backgroundColor: `hsl(${(colorIndex * 120) % 360}, 70%, 55%)` }} 
                  />
                  {area.area}
                </div>
              );
            })}
          </div>
          {/* Mobile Footer Disclaimer */}
          <div className="block md:hidden w-full text-center text-[11px] text-gray-400 pt-2 pb-1">
            실거래가 데이터는 국토교통부에서 제공됩니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full ml-0 mt-0 p-1 md:mx-0 md:max-w-none md:mt-0 md:p-0 rounded-md md:rounded-2xl">
      {/* 상단: 단지 기본 정보 */}
      <CardHeader className="pb-1 pt-1 px-1 md:pb-2 md:pt-4 md:px-2">
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button"
            aria-label="뒤로가기"
            className="block md:hidden p-1 rounded hover:bg-gray-100 active:bg-gray-200 transition"
            onClick={() => router.replace(`/region?${searchParams.toString()}`)}
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-1 md:gap-2">
            {info.name}
          </h2>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
            <Calendar className="w-3 h-3 text-gray-500" />
            <span>조회기간 {formatDateRange(info.startDate, info.endDate)}</span>
          </div>
        </div>
        {/* 지도 아이콘 + 전체 주소 (클릭 시 새창) */}
        <a
          href={`https://map.naver.com/v5/search/${encodeURIComponent(fullAddress)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-xs md:text-sm text-primary font-medium mt-0 mb-1 hover:underline hover:text-green-700 transition cursor-pointer"
          style={{ width: 'fit-content' }}
        >
          <MapPin className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
          {fullAddress}
        </a>
        {/* 모바일: 상단 정보 표 */}
        <div className="block md:hidden w-full mb-1 px-0">
          <table className="w-full text-xs border rounded overflow-hidden bg-white">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-1 font-semibold text-gray-700">평균거래가</th>
                <th className="py-3 px-1 font-semibold text-gray-700">평단가</th>
                <th className="py-3 px-1 font-semibold text-gray-700">총 거래건수</th>
                {cancelledDealsCount > 0 && (
                  <th className="py-3 px-1 font-semibold text-gray-700">취소건수</th>
                )}
                <th className="py-3 px-1 font-semibold text-gray-700">총세대수</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 px-1 text-center font-bold text-blue-700">{formatKoreanPrice(overallAvg)}</td>
                <td className="py-3 px-1 text-center font-bold text-orange-700">{avgPricePerPyeong.toLocaleString()}만원/평</td>
                <td className="py-3 px-1 text-center font-bold text-green-700">{totalDeals.toLocaleString()}건</td>
                {cancelledDealsCount > 0 && (
                  <td className="py-3 px-1 text-center font-bold text-red-600">취소 {cancelledDealsCount.toLocaleString()}건</td>
                )}
                <td className="py-3 px-1 text-center font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* 데스크톱: 카드형 */}
        <div className="hidden md:flex flex-col md:flex-row gap-1.5 md:gap-4 mt-3 md:mt-6 w-full overflow-x-auto pb-2">
          {/* 평균거래가 카드 */}
          <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
            <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-blue-500" />
            <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">평균거래가</div>
            <div className="text-sm md:text-lg font-bold text-blue-700">{formatKoreanPrice(overallAvg)}</div>
          </div>
          {/* 평균 평당가 카드 (평균거래가 뒤) */}
          <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
            <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-orange-500" />
            <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">평균 평당가</div>
            <div className="text-sm md:text-lg font-bold text-orange-700">{avgPricePerPyeong.toLocaleString()}만원/평</div>
          </div>
          {/* 총 거래 건수 카드 */}
          <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
            <BarChart className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-green-500" />
            <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">총 거래 건수</div>
            <div className="text-sm md:text-lg font-bold text-green-700">{totalDeals.toLocaleString()}건</div>
            {cancelledDealsCount > 0 && (
              <div className="text-[10px] md:text-xs font-bold text-red-600">취소 {cancelledDealsCount.toLocaleString()}건</div>
            )}
          </div>
          {/* 총세대수 카드 */}
          <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 p-2 md:p-5 flex flex-col items-center min-w-[80px] max-w-[100px] md:min-w-[140px] md:max-w-[160px]">
            <Home className="w-4 h-4 md:w-6 md:h-6 mb-1 md:mb-2 text-purple-500" />
            <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 md:mb-1">총세대수</div>
            <div className="text-sm md:text-lg font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 md:px-2">
        {/* 모바일: 표 형태 */}
        <div className="mb-1 block md:hidden px-0">
          <div className="font-semibold mb-0.5">면적별 평균 거래금액</div>
          <table className="w-full text-xs border rounded overflow-hidden bg-white">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-1 font-semibold text-gray-700">면적(㎡)</th>
                <th className="py-3 px-1 font-semibold text-gray-700">평균 거래금액</th>
                <th className="py-3 px-1 font-semibold text-gray-700">평단가</th>
                <th className="py-3 px-1 font-semibold text-gray-700">거래수</th>
              </tr>
            </thead>
            <tbody>
              {areaAvgList.map((row) => (
                <tr key={row.area} className="border-t last:border-b">
                  <td className="py-3 px-1 text-center">{row.area}</td>
                  <td className="py-3 px-1 text-center font-bold text-primary">{formatKoreanPrice(row.avg)}</td>
                  <td className="py-3 px-1 text-center font-bold text-orange-600">{row.avgPerPyeong.toLocaleString()}만원/평</td>
                  <td className="py-3 px-1 text-center text-gray-600">{row.count}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 데스크톱: 카드형 */}
        <div className="mb-6 hidden md:block">
          <div className="font-semibold mb-2">면적별 평균 거래금액</div>
          <div className="flex gap-1.5 md:gap-4 overflow-x-auto pb-2">
            {areaAvgList.map((row, idx) => (
              <div
                key={row.area}
                className="min-w-[80px] max-w-[100px] md:min-w-[120px] md:max-w-[160px] flex-shrink-0"
              >
                <Card className="shadow-sm border-2 border-muted p-2 md:p-3 flex flex-col items-center" style={{ borderColor: `hsl(${(idx * 120) % 360}, 70%, 55%)` }}>
                  <div className="text-[11px] md:text-xs font-semibold mb-0.5 md:mb-1">{row.area}㎡</div>
                  <div className="text-xs md:text-base font-bold text-primary mb-0.5 md:mb-1">{formatKoreanPrice(row.avg)}</div>
                  <div className="text-[10px] md:text-[11px] font-bold text-orange-600 mb-0.5">{row.avgPerPyeong.toLocaleString()}만원/평</div>
                  <div className="text-[10px] md:text-[11px] text-gray-500">{row.count}건</div>
                </Card>
              </div>
            ))}
          </div>
        </div>
        {/* 면적 선택 */}
        <div className="flex items-center gap-4 mb-4">
          <Select value={selectedArea} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="면적" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="전체">전체</SelectItem>
              {areaDealData.map((area) => (
                <SelectItem key={area.area} value={area.area}>
                  {area.area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* 차트 영역 */}
        <div className="w-full h-56 md:h-96 flex items-center justify-start rounded-md border mt-1 md:mt-2" style={{ background: '#f5f7fa', minHeight: 200 }}>
          {chartAreas.length > 0 && allDates.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <span className="text-muted-foreground">[거래 데이터 없음]</span>
          )}
        </div>
        {/* 범례 (예시) */}
        <div className="flex gap-4 mt-2">
          {chartAreas.map((area, idx) => {
            // 선택된 면적이 있을 때 해당 면적의 색상 사용, 없으면 기존 색상 사용
            const colorIndex = selectedArea !== "전체" ? selectedAreaIndex : idx;
            
            return (
              <div key={area.area} className="flex items-center gap-1 text-xs">
                <span
                  className="inline-block w-3 h-1.5 rounded-full"
                  style={{ backgroundColor: `hsl(${(colorIndex * 120) % 360}, 70%, 55%)` }}
                />
                {area.area}
              </div>
            );
          })}
        </div>
        {/* 카드 하단 안내 (모바일에서만) */}
        <div className="block md:hidden w-full text-center text-[11px] text-gray-400 pt-2 pb-1">
          실거래가 데이터는 국토교통부에서 제공됩니다.
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplexDetail; 