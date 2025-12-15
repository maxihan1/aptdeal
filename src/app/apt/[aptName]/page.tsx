"use client";
import { useEffect, useState } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";
import ComplexDetail, { ComplexInfo, AreaDealData, Deal as ComplexDeal } from "@/components/ComplexDetail";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

// 클라이언트 메모리 캐시 (거래 데이터)
const dealCache: { [key: string]: Deal[] } = {};

// Deal 타입 정의 추가
interface Deal {
  id: string;
  region: string;
  address: string;
  area: number;
  price: number;
  date: string;
  aptName: string;
  aptDong?: string; // 동 정보 추가
  floor: string | number;
  buildYear: string | number;
  dealMonth: string | number;
  dealDay: string | number;
  tradeType?: string;
  dealingGbn?: string;
  cdealType?: string;
  '거래유형'?: string;
  '계약해제'?: string;
  deposit?: number;
  monthlyRent?: number;
  contractType?: string;
  rent?: number;
  [key: string]: string | number | undefined;
}

function normalizeName(name: string) {
  return name.replace(/\s/g, "").toLowerCase();
}

function ComplexDetailPage({ params }: { params: Promise<{ aptName: string }> }) {
  // Next.js 최신 버전 대응: params는 Promise이므로 React.use()로 언래핑
  const { aptName } = React.use(params);
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  const decodedAptName = decodeURIComponent(aptName ?? "");
  const searchParams = useSearchParams();

  // 간결한 파라미터 사용 (s=sido, g=sigungu, d=dong, t=dealType)
  // 기존 파라미터도 하위 호환 지원
  const sido = searchParams.get("s") || searchParams.get("sido") || "";
  const sigungu = searchParams.get("g") || searchParams.get("sigungu") || "";
  const dong = searchParams.get("d") || searchParams.get("dong") || "";
  const dealType = searchParams.get("t") || searchParams.get("dealType") || "trade";
  const region = searchParams.get("r") || searchParams.get("region") || "";

  // 날짜는 URL 파라미터 우선, 없으면 로컬스토리지에서 읽기
  const urlStartDate = searchParams.get("startDate");
  const urlEndDate = searchParams.get("endDate");

  const [startDate, setStartDate] = useState(urlStartDate || threeMonthsAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(urlEndDate || today.toISOString().split('T')[0]);

  useEffect(() => {
    // URL에 날짜가 있으면 URL 우선 사용
    if (urlStartDate && urlEndDate) {
      setStartDate(urlStartDate);
      setEndDate(urlEndDate);
      return;
    }
    // URL에 날짜가 없으면 localStorage에서 읽기
    try {
      const cached = localStorage.getItem("apt_filter_state");
      if (cached) {
        const state = JSON.parse(cached);
        if (state.startDate && !urlStartDate) setStartDate(state.startDate);
        if (state.endDate && !urlEndDate) setEndDate(state.endDate);
      }
    } catch { }
  }, [urlStartDate, urlEndDate]);

  const cacheKey = `${decodedAptName}|${sido}|${sigungu}|${dong}|${startDate}|${endDate}|${dealType}`;
  const [areaDealData, setAreaDealData] = useState<AreaDealData[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<ComplexDeal[]>([]);
  const [info, setInfo] = useState<ComplexInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeals() {
      console.log('fetchDeals 호출');
      if (dealCache[cacheKey]) {
        console.log('dealCache hit');
        await processDeals(dealCache[cacheKey]);
        setLoading(false);
        return;
      }
      setLoading(true);
      // 1. API 호출 (전월세/매매에 따라 다른 API) - aptName 파라미터로 성능 최적화
      const apiPath = dealType === 'rent' ? '/api/rent' : '/api/deals';
      const res = await fetch(
        `${apiPath}?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}&dong=${encodeURIComponent(dong)}&startDate=${startDate}&endDate=${endDate}&aptName=${encodeURIComponent(decodedAptName)}`
      );
      const deals = await res.json();
      console.log('API fetch 후 deals.length:', deals?.length);
      // 2. 캐싱
      dealCache[cacheKey] = deals;
      console.log('processDeals 호출 전');
      await processDeals(deals);
      console.log('processDeals 호출 후');
      setLoading(false);
    }

    // 3. 면적별 그룹핑 및 info 생성
    async function processDeals(deals: Deal[]) {
      console.log('processDeals 함수 진입');
      const normalizedTarget = normalizeName(decodedAptName);

      // 1. '동'으로만 필터링된 거래 데이터 (aptNameOptions 생성을 위함)
      const dongFilteredOnlyDeals = deals.filter((deal) => {
        if (!dong) return true; // 동이 없으면 필터링하지 않음
        const regionTokens = (deal.region || '').split(' ');
        const dealDong = regionTokens[regionTokens.length - 1];
        return normalizeName(dealDong) === normalizeName(dong);
      });

      // 2. 기존 '단지명' 및 '동'으로 필터링된 거래 데이터 (차트 데이터 및 총 거래 건수 등을 위함)
      const filteredDeals = dongFilteredOnlyDeals.filter((deal) => {
        if (!deal.aptName || normalizeName(deal.aptName) !== normalizedTarget) return false;
        return true; // 이미 dongFilteredOnlyDeals에서 동 필터링 완료
      });

      // 콘솔 로그로 주요 값 확인
      console.log('--- processDeals LOG ---');
      console.log('dong 파라미터:', dong);
      console.log('normalizedTarget(aptName):', normalizedTarget);
      console.log('deals.length:', deals.length);
      console.log('dongFilteredOnlyDeals.length:', dongFilteredOnlyDeals.length);
      console.log('filteredDeals.length:', filteredDeals.length);
      console.log('dongFilteredOnlyDeals 샘플:', dongFilteredOnlyDeals.slice(0, 3));
      console.log('filteredDeals 샘플:', filteredDeals.slice(0, 3));
      console.log('areaOptions:', Array.from(new Set(filteredDeals.map(d => Math.floor(d.area) + "㎡"))));
      console.log('aptNameOptions:', Array.from(new Set(dongFilteredOnlyDeals.map(d => d.aptName))));
      console.log('deals region 샘플:', deals.slice(0, 5).map(d => d.region));
      console.log('deals aptName 샘플:', deals.slice(0, 5).map(d => d.aptName));
      console.log('deals area 샘플:', deals.slice(0, 5).map(d => d.area));
      console.log('------------------------');

      // **드랍다운 옵션 생성: '동'으로만 필터링된 데이터 사용**
      const areaOptions = Array.from(new Set(filteredDeals.map(d => Math.floor(d.area) + '㎡')))
        .sort((a, b) => parseFloat(a) - parseFloat(b));
      // aptNameOptions는 dongFilteredOnlyDeals에서 추출
      const aptNameOptions = Array.from(new Set(dongFilteredOnlyDeals.map(d => d.aptName)));

      // **면적별 거래 데이터 생성**
      const areaMap: {
        [area: string]: {
          date: string;
          price: number;
          rent?: number;
          contractType?: string;
          cdealType?: string;
          kaptCode?: string;
          excluUseAr?: number;
          dealAmount?: number;
          floor?: number;
        }[]
      } = {};

      if (dealType === 'rent') {
        filteredDeals.forEach((deal) => {
          const area = Math.floor(deal.area) + "㎡";
          if (!areaMap[area]) areaMap[area] = [];
          areaMap[area].push({
            date: deal.date,
            price: deal.deposit ?? 0,
            rent: deal.rent ?? 0,
            contractType: String(deal.contractType || deal.rentType || ''),
          });
        });
      } else {
        filteredDeals.forEach((deal) => {
          const area = Math.floor(deal.area) + "㎡";
          if (!areaMap[area]) areaMap[area] = [];
          const dealData: {
            date: string;
            price: number;
            cdealType: string;
            kaptCode: string;
            excluUseAr: number;
            dealAmount: number;
            floor: number;
            aptDong?: string;
          } = {
            date: deal.date,
            price: deal.price,
            cdealType: String(deal.cdealType || ''),
            kaptCode: String(deal.kaptCode || ''),
            excluUseAr: Number(deal.excluUseAr || deal.area),
            dealAmount: Number(deal.dealAmount || deal.price),
            floor: typeof deal.floor === 'number' ? deal.floor : Number(deal.floor) || 0,
          };

          // 매매 데이터에만 동 정보 추가
          if (deal.aptDong) {
            dealData.aptDong = String(deal.aptDong);
          }

          areaMap[area].push(dealData);
        });
      }
      const areaDealData = Object.entries(areaMap)
        .map(([area, prices]) => ({ area, prices }))
        .sort((a, b) => parseFloat(a.area) - parseFloat(b.area));
      setAreaDealData(areaDealData);

      // 거래 내역 리스트용 데이터 저장
      const dealsForList: ComplexDeal[] = filteredDeals.map((deal, index) => ({
        id: deal.id || `deal-${index}`,
        date: deal.date,
        area: Number(deal.area),
        floor: typeof deal.floor === 'number' ? deal.floor : Number(deal.floor) || 0,
        price: Number(deal.price),
        aptDong: deal.aptDong,
        cdealType: deal.cdealType,
        tradeType: deal.tradeType || deal.dealingGbn,
        dealingGbn: deal.dealingGbn,
        deposit: deal.deposit,
        monthlyRent: deal.monthlyRent,
        rent: deal.rent,
        contractType: deal.contractType,
      }));
      setFilteredDeals(dealsForList);

      // **info 객체에 옵션 포함**
      // 단지 상세 정보 호출
      let detailedInfo: any = {};
      try {
        const jibun = filteredDeals[0]?.address || '';
        const res = await fetch(`/api/complex/detail?aptName=${encodeURIComponent(decodedAptName)}&region=${encodeURIComponent(region)}&jibun=${encodeURIComponent(jibun)}`);
        if (res.ok) {
          detailedInfo = await res.json();
        }
      } catch (e) {
        console.error("Failed to fetch complex detail", e);
      }

      setInfo({
        name: decodedAptName,
        address: filteredDeals[0]?.address || '',
        region: filteredDeals[0]?.region || '',
        avgPrice: "",
        totalDeals: filteredDeals.length,
        totalHouseholds: detailedInfo.kaptdaCnt || 0,
        startDate,
        endDate,
        areaOptions,
        aptNameOptions,

        // Basic Info
        kaptDongCnt: detailedInfo.kaptDongCnt,
        kaptUsedate: detailedInfo.kaptUsedate,
        kaptBcompany: detailedInfo.kaptBcompany,
        codeHeatNm: detailedInfo.codeHeatNm,
        codeHallNm: detailedInfo.codeHallNm,
        kaptdEcntp: detailedInfo.kaptdEcntp,
        kaptdPcnt: detailedInfo.kaptdPcnt,
        kaptdPcntu: detailedInfo.kaptdPcntu,

        // Living Info
        subwayLine: detailedInfo.subwayLine,
        subwayStation: detailedInfo.subwayStation,
        kaptdWtimebus: detailedInfo.kaptdWtimebus,
        kaptdWtimesub: detailedInfo.kaptdWtimesub,

        // School Info
        educationFacility: detailedInfo.educationFacility,
      });
    }

    fetchDeals();
  }, [cacheKey, decodedAptName, sido, sigungu, dong, startDate, endDate, dealType, region]);

  return (
    <div className="w-full flex flex-col md:flex-row relative">
      {/* Loading Overlay Modal */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-lg p-6 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">데이터 로딩 중</p>
              <p className="text-sm text-muted-foreground">잠시만 기다려주세요...</p>
            </div>
          </div>
        </div>
      )}

      {info ? (
        <main className="flex-1 min-w-0 md:ml-2 py-2 md:py-2">
          <ComplexDetail
            info={info}
            areas={["전체", ...areaDealData.map((a) => a.area)]}
            areaDealData={areaDealData}
            deals={filteredDeals}
            dealType={dealType as "trade" | "rent"}
          />
        </main>
      ) : !loading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <p className="text-muted-foreground">단지 정보를 불러올 수 없습니다.</p>
        </div>
      ) : null}
    </div>
  );
}

export default function PageWithSuspense(props: { params: Promise<{ aptName: string }> }) {
  return (
    <Suspense>
      <ComplexDetailPage {...props} />
    </Suspense>
  );
} 