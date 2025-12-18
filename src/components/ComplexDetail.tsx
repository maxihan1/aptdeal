/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MapPin, BarChart, ArrowLeft, Home } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { PriceChart } from "./complex/price-chart";
import { DealList } from "./complex/deal-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "@/lib/utils";

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

  // Basic Info
  kaptDongCnt?: number;
  kaptUsedate?: string;
  kaptBcompany?: string;
  codeHeatNm?: string;
  codeHallNm?: string;
  kaptdEcntp?: number; // Total parking (ground + underground)
  kaptdPcnt?: number; // Ground parking
  kaptdPcntu?: number; // Underground parking

  // Living Info
  subwayLine?: string;
  subwayStation?: string;
  kaptdWtimebus?: string;
  kaptdWtimesub?: string;

  // School Info
  educationFacility?: string;
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
  }[];
};

// 거래 데이터 타입 (DealList용)
export interface Deal {
  id?: string;
  date: string;
  area: number;
  floor: number | string;
  price: number;
  aptDong?: string;
  cdealType?: string;
  tradeType?: string;
  dealingGbn?: string;
  deposit?: number;
  monthlyRent?: number;
  rent?: number;
  contractType?: string;
}

interface ComplexDetailProps {
  info: ComplexInfo;
  areas: string[]; // 예: ["전체", "59㎡", "84㎡", ...]
  areaDealData: AreaDealData[]; // 면적별 거래 데이터 (매매)
  deals?: Deal[]; // 거래 내역 리스트용 (매매)
  dealType?: "trade" | "rent"; // 초기 탭 결정용
  // 전월세 데이터 (옵션)
  rentAreaDealData?: AreaDealData[];
  rentDeals?: Deal[];
}

function InfoItem({ label, value, icon }: { label: string, value: string, icon: string }) {
  return (
    <div className="bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm hover:bg-accent/5 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="font-bold text-foreground">{value}</span>
    </div>
  );
}

const ComplexDetail: React.FC<ComplexDetailProps> = ({
  info,
  areaDealData,
  deals = [],
  dealType: propDealType,
  rentAreaDealData = [],
  rentDeals = []
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedArea, setSelectedArea] = React.useState("전체");
  const [selectedDateRange, setSelectedDateRange] = React.useState<number>(3); // 기본값 3개월

  // 탭 상태 관리 - URL 파라미터 'dealType' 또는 't'로 초기값 설정
  const initialTab = searchParams.get('t') || searchParams.get('dealType') || propDealType || 'trade';
  const [activeTab, setActiveTab] = React.useState<'trade' | 'rent'>(initialTab as 'trade' | 'rent');

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: 'trade' | 'rent') => {
    setActiveTab(tab);
    setSelectedArea("전체"); // 탭 변경 시 면적 선택 초기화
    // URL 파라미터 업데이트 (히스토리에 추가하지 않음)
    const params = new URLSearchParams(searchParams.toString());
    params.set('t', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // 현재 탭에 따른 데이터 선택
  const currentAreaDealData = activeTab === 'rent' ? rentAreaDealData : areaDealData;
  const currentDeals = activeTab === 'rent' ? rentDeals : deals;
  const isRent = activeTab === 'rent';

  // 날짜 포맷팅 함수
  function formatDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getFullYear()}년 ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }

  // 억/천만원 단위 포맷 함수
  function formatKoreanPrice(price: number) {
    if (!price) return "-";
    const eok = Math.floor(price / 10000);
    const remainder = Math.round(price % 10000);

    if (eok > 0) {
      return remainder > 0
        ? `${eok}억 ${remainder.toLocaleString()}만원`
        : `${eok}억`;
    }
    return `${remainder.toLocaleString()}만원`;
  }

  // 데이터 필터링 (취소건 제외, 전월세는 전세만)
  const processedData = useMemo(() => {
    let data = currentAreaDealData;

    // 전월세인 경우: 전세만 필터링 (월세 제외: rent/monthlyRent가 0이거나 없는 경우만)
    if (isRent) {
      data = currentAreaDealData.map(area => ({
        ...area,
        prices: area.prices.filter(p =>
          p.price > 0 && (p.rent === undefined || p.rent === 0)
        ),
      })).filter(area => area.prices.length > 0);
    }

    // 취소 건 제외 로직 (cdealType='Y' 등 제외, 해제 계약 제외)
    return data.map(area => ({
      ...area,
      prices: area.prices.filter(p => !['Y', 'O'].includes(p.cdealType || '') && p.contractType !== '해제')
    })).filter(area => area.prices.length > 0);
  }, [currentAreaDealData, activeTab, isRent]);

  // 날짜 범위 변경 핸들러
  const handleDateRangeChange = (months: number) => {
    setSelectedDateRange(months);
    const end = new Date();
    const start = new Date();
    if (months === 0) { // 전체 (임의로 10년)
      start.setFullYear(end.getFullYear() - 10);
    } else {
      start.setMonth(end.getMonth() - months);
    }

    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('startDate', start.toISOString().split('T')[0]);
    newParams.set('endDate', end.toISOString().split('T')[0]);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // 통계 계산 (선택된 면적 기준)
  const stats = useMemo(() => {
    const targetData = selectedArea === "전체"
      ? processedData
      : processedData.filter(d => d.area === selectedArea);

    const allPrices = targetData.flatMap(a => a.prices.map(p => p.price));
    const totalDeals = allPrices.length;
    const avgPrice = totalDeals ? Math.round(allPrices.reduce((a, b) => a + b, 0) / totalDeals) : 0;

    // 평단가 계산
    const allPyeongs = targetData.flatMap(a => {
      const areaNum = parseFloat(a.area.replace('㎡', ''));
      if (!areaNum) return [];
      return a.prices.map(p => p.price / (areaNum / 2.48)); // 공급면적 기준 평당가
    });
    const avgPerPyeong = allPyeongs.length ? Math.round(allPyeongs.reduce((a, b) => a + b, 0) / allPyeongs.length) : 0;

    return { totalDeals, avgPrice, avgPerPyeong };
  }, [processedData, selectedArea]);

  // 면적별 통계
  const areaStats = useMemo(() => {
    return processedData.map(area => {
      const areaNum = parseFloat(area.area.replace('㎡', ''));
      const avg = area.prices.length ? Math.round(area.prices.reduce((a, b) => a + b.price, 0) / area.prices.length) : 0;
      const avgPerPyeong = areaNum ? Math.round(avg / (areaNum / 2.48)) : 0; // 공급면적 기준
      return {
        area: area.area,
        count: area.prices.length,
        avg,
        avgPerPyeong
      };
    });
  }, [processedData]);

  // Recharts용 데이터 변환
  const chartData = useMemo(() => {
    const dataMap: { [date: string]: { date: string;[key: string]: string | number } } = {};
    const targetAreas = selectedArea === "전체" ? processedData.map(a => a.area) : [selectedArea];

    processedData.forEach(areaData => {
      if (targetAreas.includes(areaData.area)) {
        areaData.prices.forEach(p => {
          if (!dataMap[p.date]) dataMap[p.date] = { date: p.date };
          if (dataMap[p.date][areaData.area]) {
            dataMap[p.date][areaData.area] = p.price;
          } else {
            dataMap[p.date][areaData.area] = p.price;
          }
        });
      }
    });

    return Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [processedData, selectedArea]);

  // 면적별 고정 컬러 생성 (인덱스 기반)
  const areaColors = useMemo(() => {
    const colors: Record<string, string> = {};
    areaStats.forEach((stat, idx) => {
      colors[stat.area] = `hsl(${(idx * 137) % 360}, 70%, 50%)`;
    });
    return colors;
  }, [areaStats]);

  const targetAreas = selectedArea === "전체" ? areaStats.map(a => a.area) : [selectedArea];
  const fullAddress = `${info.region} ${info.address}`.trim();

  return (
    <Card className="w-full border-none shadow-none md:border md:shadow-sm md:rounded-xl bg-transparent md:bg-card">
      <CardHeader className="px-4 md:px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="p-2 -ml-2 hover:bg-accent rounded-full md:hidden"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">{info.name}</h1>
                <a
                  href={`https://map.naver.com/v5/search/${encodeURIComponent(fullAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors mt-1"
                >
                  <MapPin className="w-3 h-3" />
                  {fullAddress}
                </a>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 md:px-6 space-y-8">
        <Tabs defaultValue="price" className="w-full">
          <div className="w-full overflow-x-auto pb-2 mb-6 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-b rounded-none space-x-6 md:space-x-8">
              <TabsTrigger
                value="price"
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-semibold text-muted-foreground data-[state=active]:text-primary transition-all hover:text-foreground"
              >
                가격 정보
              </TabsTrigger>
              <TabsTrigger
                value="basic"
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-semibold text-muted-foreground data-[state=active]:text-primary transition-all hover:text-foreground"
              >
                기본 정보
              </TabsTrigger>
              <TabsTrigger
                value="living"
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-semibold text-muted-foreground data-[state=active]:text-primary transition-all hover:text-foreground"
              >
                생활 정보
              </TabsTrigger>
              <TabsTrigger
                value="school"
                className="rounded-none border-b-2 border-transparent px-2 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-semibold text-muted-foreground data-[state=active]:text-primary transition-all hover:text-foreground"
              >
                학군 정보
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="price" className="space-y-8 animate-in fade-in-50 duration-500">
            {/* 매매/전월세 탭 */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleTabChange('trade')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  activeTab === 'trade'
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                매매 ({deals.length}건)
              </button>
              <button
                onClick={() => handleTabChange('rent')}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  activeTab === 'rent'
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                전월세 ({rentDeals.length}건)
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: '1개월', value: 1 },
                { label: '3개월', value: 3 },
                { label: '6개월', value: 6 },
                { label: '1년', value: 12 },
                { label: '3년', value: 36 },
                { label: '전체', value: 0 },
              ].map((range) => (
                <button
                  key={range.label}
                  onClick={() => handleDateRangeChange(range.value)}
                  className={cn(
                    "px-3 py-1 text-xs md:text-sm border rounded-full transition-colors",
                    selectedDateRange === range.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {/* 선택된 기간 표시 */}
            <div className="text-base md:text-lg font-semibold text-foreground mb-4">
              {selectedDateRange === 0
                ? `${info.startDate?.replace(/-/g, '.')} ~ ${info.endDate?.replace(/-/g, '.')}`
                : selectedDateRange === 1
                  ? '최근 1개월'
                  : selectedDateRange === 12
                    ? '최근 1년'
                    : selectedDateRange === 36
                      ? '최근 3년'
                      : `최근 ${selectedDateRange}개월`
              }
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-4">
              <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-xs text-muted-foreground mb-1">{selectedArea === '전체' ? (isRent ? '전체 평균 보증금' : '전체 평균 거래가') : (isRent ? `${selectedArea} 평균 보증금` : `${selectedArea} 평균 거래가`)}</span>
                <span className="text-sm md:text-lg font-bold text-primary">{formatKoreanPrice(stats.avgPrice)}</span>
              </div>
              <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-xs text-muted-foreground mb-1">{isRent ? '평당 보증금' : '평당가'}</span>
                <span className="text-sm md:text-lg font-bold text-primary">{stats.avgPerPyeong.toLocaleString()}만원</span>
              </div>
              <div className="bg-card border rounded-lg p-3 flex flex-col items-center justify-center text-center shadow-sm">
                <span className="text-xs text-muted-foreground mb-1">총 거래</span>
                <span className="text-sm md:text-lg font-bold text-primary">{stats.totalDeals}건</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg px-1 flex items-center gap-2">
                <BarChart className="w-5 h-5 text-primary" />
                면적별 현황
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {areaStats.map((stat, idx) => (
                  <div
                    key={stat.area}
                    className={cn(
                      "bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all cursor-pointer group",
                      selectedArea === stat.area ? "ring-2 ring-primary bg-primary/5" : ""
                    )}
                    onClick={() => setSelectedArea(selectedArea === stat.area ? "전체" : stat.area)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-10 rounded-full transition-transform group-hover:scale-y-110" style={{ backgroundColor: areaColors[stat.area] }} />
                      <div>
                        <div className="font-bold text-lg">{stat.area} <span className="font-normal text-sm text-muted-foreground">({Math.round(parseFloat(stat.area) / 2.48)}평)</span></div>
                        <div className="text-xs text-muted-foreground">{stat.count}건 거래</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary text-lg">{formatKoreanPrice(stat.avg)}</div>
                      <div className="text-xs text-muted-foreground">{stat.avgPerPyeong.toLocaleString()}만원/평</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <BarChart className="w-5 h-5 text-primary" />
                  가격 추이
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({(() => {
                      const start = new Date(info.startDate);
                      const end = new Date(info.endDate);
                      const diffTime = Math.abs(end.getTime() - start.getTime());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      // Roughly check range
                      if (diffDays >= 3650) return '전체';
                      if (diffDays >= 1090) return '최근 3년';
                      if (diffDays >= 360) return '최근 1년';
                      if (diffDays >= 170) return '최근 6개월';
                      if (diffDays >= 85) return '최근 3개월'; // 3 months is ~90 days
                      if (diffDays >= 25) return '최근 1개월';
                      return '사용자 지정';
                    })()})
                  </span>
                </h3>
                <Select value={selectedArea} onValueChange={setSelectedArea}>
                  <SelectTrigger className="w-[110px] h-9 text-sm">
                    <SelectValue placeholder="면적 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="전체">전체 면적</SelectItem>
                    {areaStats.map(s => (
                      <SelectItem key={s.area} value={s.area}>{s.area} ({Math.round(parseFloat(s.area) / 2.48)}평)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <PriceChart data={chartData} areas={targetAreas} colors={areaColors} />
              </div>
            </div>

            {/* 거래 내역 리스트 */}
            {currentDeals.length > 0 && (
              <div className="space-y-4">
                <DealList
                  deals={currentDeals}
                  dealType={activeTab}
                  selectedArea={selectedArea}
                  pageSize={15}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="basic" className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="flex items-center gap-2 px-1">
              <Home className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">단지 기본 정보</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoItem label="총 세대수" value={info.totalHouseholds ? `${info.totalHouseholds.toLocaleString()}세대` : '-'} icon="🏢" />
              <InfoItem label="동 수" value={info.kaptDongCnt ? `${info.kaptDongCnt}개동` : '-'} icon="🏘️" />
              <InfoItem label="사용승인일" value={info.kaptUsedate || '-'} icon="📅" />
              <InfoItem label="건설사" value={info.kaptBcompany || '-'} icon="🏗️" />
              <InfoItem label="난방 방식" value={info.codeHeatNm || '-'} icon="🔥" />
              <InfoItem label="복도 유형" value={info.codeHallNm || '-'} icon="🚪" />
              <div className="bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm hover:bg-accent/5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🅿️</span>
                  <span className="text-sm font-medium text-muted-foreground">총 주차 대수</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-foreground">{info.kaptdEcntp ? `${info.kaptdEcntp.toLocaleString()}대` : '-'}</span>
                  {(info.kaptdPcnt !== undefined || info.kaptdPcntu !== undefined) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      지상 {info.kaptdPcnt?.toLocaleString() ?? 0}대 · 지하 {info.kaptdPcntu?.toLocaleString() ?? 0}대
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="living" className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="flex items-center gap-2 px-1">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">교통 및 접근성</h3>
            </div>
            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
              {info.subwayStation ? (
                <>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-2xl">
                      🚇
                    </div>
                    <div>
                      <div className="font-bold text-lg">{info.subwayStation} <span className="text-sm font-normal text-muted-foreground ml-1">{info.subwayLine}</span></div>
                      <div className="text-muted-foreground">가장 가까운 지하철역</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg">
                      <span className="font-medium text-muted-foreground">지하철역까지 도보</span>
                      <span className="font-bold text-primary text-lg">{info.kaptdWtimesub || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg">
                      <span className="font-medium text-muted-foreground">버스정류장까지 도보</span>
                      <span className="font-bold text-primary text-lg">{info.kaptdWtimebus || '-'}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">지하철 정보가 확인되지 않습니다.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="school" className="space-y-6 animate-in fade-in-50 duration-500">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xl">🎓</span>
              <h3 className="text-lg font-semibold">학군 및 교육 시설</h3>
            </div>

            {info.educationFacility ? (
              (() => {
                const facilityText = info.educationFacility || '';

                // Regex로 각 키워드 뒤의 괄호 안 내용 추출
                // 예: "초등학교(동천,풍천) 중학교(풍천)..." -> "동천,풍천" 추출
                const extractValue = (text: string, regex: RegExp) => {
                  const match = text.match(regex);
                  return match && match[1] ? match[1].trim() : null;
                };

                const elementary = extractValue(facilityText, /초등학교\s*\(([^)]*)\)/);
                const middle = extractValue(facilityText, /중학교\s*\(([^)]*)\)/);
                const high = extractValue(facilityText, /고등학교\s*\(([^)]*)\)/);
                const uni = extractValue(facilityText, /(?:대학교|대학\(교\))\s*\(([^)]*)\)/);

                // 파싱된 데이터가 하나라도 있으면 파싱 모드, 없으면 기존 텍스트 표시 (fallback)
                const hasParsedData = elementary || middle || high || uni;

                // 기타 시설: 학교 키워드가 포함되지 않은 나머지 텍스트 (줄바꿈 기준)
                // 만약 한 줄에 다 들어있었다면 'others'는 없을 수 있음.
                const others = facilityText.split('\n')
                  .map(l => l.trim())
                  .filter(l => l.length > 0 &&
                    !l.includes('초등학교') &&
                    !l.includes('중학교') &&
                    !l.includes('고등학교') &&
                    !l.includes('대학교') &&
                    !l.includes('대학(교)')
                  );

                if (!hasParsedData && others.length === 0) {
                  // 데이터는 있는데 파싱 실패 시 원본 그대로 출력
                  return (
                    <div className="bg-card border rounded-xl p-6 shadow-sm">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{facilityText}</div>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {elementary && (
                      <InfoItem label="초등학교" value={elementary} icon="🎒" />
                    )}
                    {middle && (
                      <InfoItem label="중학교" value={middle} icon="🏫" />
                    )}
                    {high && (
                      <InfoItem label="고등학교" value={high} icon="🎓" />
                    )}
                    {uni && (
                      <InfoItem label="대학교" value={uni} icon="🏛️" />
                    )}

                    {others.length > 0 && (
                      <div className="md:col-span-2">
                        <div className="bg-card border rounded-lg p-4 shadow-sm hover:bg-accent/5 transition-colors">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xl">📍</span>
                            <span className="text-sm font-medium text-muted-foreground">기타 주변 시설</span>
                          </div>
                          <span className="font-medium text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                            {others.join('\n')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground shadow-sm">
                교육 시설 정보가 등록되지 않았습니다.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ComplexDetail;