import React from "react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MapPin, BarChart, ArrowLeft } from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
} from "chart.js";
import { useRouter, useSearchParams } from "next/navigation";
import type { TooltipItem, Tick, Scale } from 'chart.js';

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
  prices: { date: string; price: number }[]; // 라인차트용
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

  // x축 라벨: 모든 거래 날짜(YYYY-MM-DD)
  const allDates = React.useMemo(() => Array.from(
    new Set(areaDealData.flatMap((a) => a.prices.map((p) => p.date)))
  ).sort(), [areaDealData]);

  // 차트에 표시할 데이터(면적 선택)
  const chartAreas = selectedArea === "전체" ? areaDealData : areaDealData.filter((a) => a.area === selectedArea);

  // 전체 평균 가격: 모든 면적 데이터 합산
  const allPrices = areaDealData.flatMap((a) => a.prices.map((p) => p.price));
  const overallAvg = allPrices.length ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;

  // 전체 평균 평당가 계산
  const allPricePerPyeong = areaDealData.flatMap((a) => a.prices.map((p) => a.prices.length && a.area ? (p.price / parseFloat(a.area)) * 3.3058 : 0));
  const avgPricePerPyeong = allPricePerPyeong.length ? Math.round(allPricePerPyeong.reduce((a, b) => a + b, 0) / allPricePerPyeong.length) : 0;

  // 차트 데이터: 모든 거래 날짜에 맞춰 점 생성
  const chartData = {
    labels: allDates,
    datasets: chartAreas.map((area, idx) => ({
      label: area.area,
      data: allDates.map(
        (date) => {
          const found = area.prices.find((p) => p.date === date);
          return found ? found.price : null;
        }
      ),
      borderColor: `hsl(${(idx * 120) % 360}, 70%, 55%)`,
      backgroundColor: `hsla(${(idx * 120) % 360}, 70%, 80%, 0.18)`,
      pointBackgroundColor: `hsl(${(idx * 120) % 360}, 70%, 55%)`,
      pointBorderColor: '#fff',
      pointRadius: 5,
      pointHoverRadius: 8,
      borderWidth: 3,
      tension: 0.45,
      fill: true,
      spanGaps: true,
    })),
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
    scales: {
      x: {
        grid: {
          color: '#e5e7eb',
        },
        ticks: {
          callback: function(value: number | string, index: number, ticks: Tick[]): string | number | null {
            const total = ticks.length;
            const isMobile = window.innerWidth <= 768;
            
            if (isMobile) {
              // 모바일: 시작과 끝만 표시
              if (index === 0 || index === total - 1) {
                // value가 날짜 인덱스이므로 allDates 배열에서 가져옴
                const dateIndex = typeof value === 'number' ? value : parseInt(value as string);
                const date = allDates[dateIndex];
                if (date) {
                  const [year, month] = date.split('-');
                  return `${year}년 ${Number(month)}월`;
                }
                return '';
              }
              return '';
            } else {
              // 데스크톱: 기존 로직 유지
              if (total <= 10) {
                const dateIndex = typeof value === 'number' ? value : parseInt(value as string);
                const date = allDates[dateIndex];
                if (date) {
                  const [year, month, day] = date.split('-');
                  return `${year}년 ${Number(month)}월` + (total <= 10 ? ` ${Number(day)}일` : '');
                }
                return '';
              }
              const step = Math.floor((total - 1) / 9);
              if (index === 0 || index === total - 1 || index % step === 0) {
                const dateIndex = typeof value === 'number' ? value : parseInt(value as string);
                const date = allDates[dateIndex];
                if (date) {
                  const [year, month] = date.split('-');
                  return `${year}년 ${Number(month)}월`;
                }
                return '';
              }
              return '';
            }
          },
          color: '#888',
          font: { size: 14 },
          maxRotation: 0,
          autoSkip: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(this: Scale, value: string | number): string | number | null {
            const isMobile = window.innerWidth <= 768;
            const numValue = typeof value === 'number' ? value : parseFloat(value);
            if (isMobile) {
              // 모바일: 억 단위만 표시
              if (numValue >= 10000 && numValue % 10000 === 0) {
                const eok = Math.floor(numValue / 10000);
                return `${eok}억원`;
              }
              return '';
            } else {
              // 데스크톱: 억/천만원 단위 표시
              if (numValue >= 10000) {
                const eok = Math.floor(numValue / 10000);
                const chun = Math.round((numValue % 10000) / 1000);
                if (eok > 0 && chun > 0) {
                  return `${eok}억 ${chun}천만원`;
                } else if (eok > 0) {
                  return `${eok}억원`;
                } else {
                  return `${chun}천만원`;
                }
              }
              return numValue;
            }
          },
          color: '#888',
          font: { size: 14 },
          maxTicksLimit: 6,
        },
        grid: {
          color: '#eee',
        },
      },
    },
  }), [allDates]);

  // 면적별 평균 가격
  function getAreaAvgPrice(areaData: AreaDealData): number {
    if (!areaData.prices.length) return 0;
    const sum = areaData.prices.reduce((acc, cur) => acc + cur.price, 0);
    return Math.round(sum / areaData.prices.length);
  }
  const areaAvgList = areaDealData.map((area) => ({
    area: area.area,
    avg: getAreaAvgPrice(area),
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
  // areaDealData는 [{ area, prices: [{date, price}]}] 구조인데, price가 보증금, rent가 0인 데이터만 사용해야 함
  // areaDealData를 rent===0인 데이터만으로 재가공
  let jeonseAreaDealData = areaDealData;
  if (isRent) {
    // areaDealData의 prices에 rent 필드가 없으므로, info.areaDealRawData를 prop으로 넘기거나, 프론트에서 rentRawData를 별도 관리해야 함
    // 여기서는 areaDealData의 prices에 price가 보증금(rent===0)만 있다고 가정하고, areaDealData를 그대로 사용
    // 실제로는 rentRawData에서 rent===0인 데이터만 area별로 group해서 areaDealData를 만들어야 함
    // 아래는 areaDealData.prices에서 price가 0이 아닌 것만 남기는 예시
    jeonseAreaDealData = areaDealData.map(area => ({
      ...area,
      prices: area.prices.filter(p => p.price > 0),
    })).filter(area => area.prices.length > 0);
  }

  // 전체 전세 보증금 평균
  const jeonseAllPrices = isRent
    ? jeonseAreaDealData.flatMap((a) => a.prices.map((p) => p.price))
    : areaDealData.flatMap((a) => a.prices.map((p) => p.price));
  const jeonseOverallAvg = jeonseAllPrices.length ? Math.round(jeonseAllPrices.reduce((a, b) => a + b, 0) / jeonseAllPrices.length) : 0;

  // 전체 전세 평당가 평균
  const jeonseAllPricePerPyeong = isRent
    ? jeonseAreaDealData.flatMap((a) => a.prices.map((p) => a.prices.length && a.area ? (p.price / parseFloat(a.area)) * 3.3058 : 0))
    : areaDealData.flatMap((a) => a.prices.map((p) => a.prices.length && a.area ? (p.price / parseFloat(a.area)) * 3.3058 : 0));
  const jeonseAvgPricePerPyeong = jeonseAllPricePerPyeong.length ? Math.round(jeonseAllPricePerPyeong.reduce((a, b) => a + b, 0) / jeonseAllPricePerPyeong.length) : 0;

  // 전세 거래건수
  const jeonseTotalDeals = jeonseAllPrices.length;

  // 면적별 평균 전세 보증금
  function getJeonseAreaAvgPrice(areaData: AreaDealData): number {
    if (!areaData.prices.length) return 0;
    const sum = areaData.prices.reduce((acc, cur) => acc + cur.price, 0);
    return Math.round(sum / areaData.prices.length);
  }
  const jeonseAreaAvgList = jeonseAreaDealData.map((area) => ({
    area: area.area,
    avg: getJeonseAreaAvgPrice(area),
    count: area.prices.length,
  }));

  // 차트 데이터: 전세(월세 0)만 사용
  const jeonseAllDates = React.useMemo(() => Array.from(
    new Set(jeonseAreaDealData.flatMap((a) => a.prices.map((p) => p.date)))
  ).sort(), [jeonseAreaDealData]);
  const jeonseChartAreas = selectedArea === "전체" ? jeonseAreaDealData : jeonseAreaDealData.filter((a) => a.area === selectedArea);
  const jeonseChartData = {
    labels: jeonseAllDates,
    datasets: jeonseChartAreas.map((area, idx) => ({
      label: area.area,
      data: jeonseAllDates.map(
        (date) => {
          const found = area.prices.find((p) => p.date === date);
          return found ? found.price : null;
        }
      ),
      borderColor: `hsl(${(idx * 120) % 360}, 70%, 55%)`,
      backgroundColor: `hsla(${(idx * 120) % 360}, 70%, 80%, 0.18)`,
      pointBackgroundColor: `hsl(${(idx * 120) % 360}, 70%, 55%)`,
      pointBorderColor: '#fff',
      pointRadius: 5,
      pointHoverRadius: 8,
      borderWidth: 3,
      tension: 0.45,
      fill: true,
      spanGaps: true,
    })),
  };

  // 차트 렌더링 직전 진단용 로그
  console.log('[전월세] jeonseChartData', jeonseChartData);
  console.log('[전월세] 차트 렌더링 조건:', jeonseChartAreas.length > 0, jeonseAllDates.length > 0);

  // 진단용 콘솔 로그
  React.useEffect(() => {
    console.log('[ComplexDetail] isRent:', isRent, 'dealType:', dealType);
    console.log('[전월세] areaDealData', areaDealData);
    console.log('[전월세] jeonseAreaDealData', jeonseAreaDealData);
    console.log('[전월세] jeonseChartAreas', jeonseChartAreas);
    console.log('[전월세] jeonseAllDates', jeonseAllDates);
    console.log('[전월세] selectedArea', selectedArea);
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
                  {/* <th className="py-3 px-1 font-semibold text-gray-700">총세대수</th> */}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 px-1 text-center font-bold text-blue-700">{formatKoreanPrice(jeonseOverallAvg)}</td>
                  <td className="py-3 px-1 text-center font-bold text-orange-700">{jeonseAvgPricePerPyeong.toLocaleString()}만원/평</td>
                  <td className="py-3 px-1 text-center font-bold text-green-700">{jeonseTotalDeals.toLocaleString()}건</td>
                  {/* <td className="py-3 px-1 text-center font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</td> */}
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
              <div className="text-sm md:text-lg font-bold text-green-700">{jeonseTotalDeals.toLocaleString()}건</div>
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
                  <th className="py-3 px-1 font-semibold text-gray-700">거래수</th>
                </tr>
              </thead>
              <tbody>
                {jeonseAreaAvgList.map((row) => (
                  <tr key={row.area} className="border-t last:border-b">
                    <td className="py-3 px-1 text-center">{row.area}</td>
                    <td className="py-3 px-1 text-center font-bold text-primary">{formatKoreanPrice(row.avg)}</td>
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
              <Line data={jeonseChartData} options={chartOptions} />
            ) : (
              <span className="text-muted-foreground">[거래 데이터 없음]</span>
            )}
          </div>
          {/* 범례 for Rent */}
          <div className="flex gap-4 mt-2">
            {jeonseChartAreas.map((area, idx) => (
              <div key={area.area} className="flex items-center gap-1 text-xs">
                <span className="inline-block w-3 h-1.5 rounded-full" style={{ backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)` }} />
                {area.area}
              </div>
            ))}
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
                {/* <th className="py-3 px-1 font-semibold text-gray-700">총세대수</th> */}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 px-1 text-center font-bold text-blue-700">{formatKoreanPrice(overallAvg)}</td>
                <td className="py-3 px-1 text-center font-bold text-orange-700">{avgPricePerPyeong.toLocaleString()}만원/평</td>
                <td className="py-3 px-1 text-center font-bold text-green-700">{info.totalDeals.toLocaleString()}건</td>
                {/* <td className="py-3 px-1 text-center font-bold text-purple-700">{info.totalHouseholds.toLocaleString()}세대</td> */}
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
            <div className="text-sm md:text-lg font-bold text-green-700">{info.totalDeals.toLocaleString()}건</div>
          </div>
          {/* 총세대수 카드 */}
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
          <div className="font-semibold mb-0.5">면적별 평균 거래금액</div>
          <table className="w-full text-xs border rounded overflow-hidden bg-white">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-3 px-1 font-semibold text-gray-700">면적(㎡)</th>
                <th className="py-3 px-1 font-semibold text-gray-700">평균 거래금액</th>
                <th className="py-3 px-1 font-semibold text-gray-700">거래수</th>
              </tr>
            </thead>
            <tbody>
              {areaAvgList.map((row) => (
                <tr key={row.area} className="border-t last:border-b">
                  <td className="py-3 px-1 text-center">{row.area}</td>
                  <td className="py-3 px-1 text-center font-bold text-primary">{formatKoreanPrice(row.avg)}</td>
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
          {chartAreas.map((area, idx) => (
            <div key={area.area} className="flex items-center gap-1 text-xs">
              <span
                className="inline-block w-3 h-1.5 rounded-full"
                style={{ backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 60%)` }}
              />
              {area.area}
            </div>
          ))}
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