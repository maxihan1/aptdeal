"use client";
import { useEffect, useState } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";
import ComplexDetail, { ComplexInfo, AreaDealData } from "@/components/ComplexDetail";
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
  const decodedAptName = decodeURIComponent(aptName ?? "신봉마을동일하이빌3단지");
  const searchParams = useSearchParams();
  const region = searchParams.get("region") ?? "";
  const sido = searchParams.get("sido") ?? "경기도";
  const sigungu = searchParams.get("sigungu") ?? "";
  const dong = searchParams.get("dong") ?? "";
  const startDate = searchParams.get("startDate") ?? "2023-01-01";
  const endDate = searchParams.get("endDate") ?? "2023-12-31";
  const dealType = searchParams.get("dealType") ?? "trade";

  const cacheKey = `${decodedAptName}|${sido}|${sigungu}|${dong}|${startDate}|${endDate}|${dealType}`;
  const [areaDealData, setAreaDealData] = useState<AreaDealData[]>([]);
  const [info, setInfo] = useState<ComplexInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeals() {
      console.log('fetchDeals 호출');
      if (dealCache[cacheKey]) {
        console.log('dealCache hit');
        processDeals(dealCache[cacheKey]);
        setLoading(false);
        return;
      }
      setLoading(true);
      // 1. API 호출
      const res = await fetch(
        `/api/deals?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}&dong=${encodeURIComponent(dong)}&startDate=${startDate}&endDate=${endDate}&dealType=${dealType}`
      );
      const deals = await res.json();
      console.log('API fetch 후 deals.length:', deals.length);
      // 2. 캐싱
      dealCache[cacheKey] = deals;
      console.log('processDeals 호출 전');
      processDeals(deals);
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
      const areaOptions = Array.from(new Set(filteredDeals.map(d => Math.floor(d.area) + '㎡')));
      // aptNameOptions는 dongFilteredOnlyDeals에서 추출
      const aptNameOptions = Array.from(new Set(dongFilteredOnlyDeals.map(d => d.aptName)));

      // **면적별 거래 데이터 생성**
      const areaMap: { [area: string]: { date: string; price: number; rent?: number }[] } = {};
      if (dealType === 'rent') {
        filteredDeals.forEach((deal) => {
          const area = Math.floor(deal.area) + "㎡";
          if (!areaMap[area]) areaMap[area] = [];
          areaMap[area].push({ date: deal.date, price: deal.deposit ?? 0, rent: deal.rent ?? 0 });
        });
      } else {
        filteredDeals.forEach((deal) => {
          const area = Math.floor(deal.area) + "㎡";
          if (!areaMap[area]) areaMap[area] = [];
          areaMap[area].push({ date: deal.date, price: deal.price });
        });
      }
      const areaDealData = Object.entries(areaMap).map(([area, prices]) => ({ area, prices }));
      setAreaDealData(areaDealData);

      // **info 객체에 옵션 포함**
      // 총 세대수 API 호출
      let totalHouseholds = 0;
      try {
        const res = await fetch(`/api/apt-households?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}&dong=${encodeURIComponent(dong)}&aptName=${encodeURIComponent(decodedAptName)}`);
        const data = await res.json();
        totalHouseholds = data.kaptdaCnt || 0;
      } catch (e) {
        totalHouseholds = 0;
      }
      setInfo({
        name: decodedAptName,
        address: filteredDeals[0]?.address || '',
        region: filteredDeals[0]?.region || '',
        avgPrice: "",
        totalDeals: filteredDeals.length,
        totalHouseholds,
        startDate,
        endDate,
        areaOptions,
        aptNameOptions,
      });
    }

    fetchDeals();
  }, [cacheKey, decodedAptName, sido, sigungu, dong, startDate, endDate, dealType, region]);

  if (loading || !info) return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
      <div className="text-lg font-semibold text-blue-600">데이터를 불러오는 중입니다...</div>
    </div>
  );

  return (
    <div className="w-full flex flex-col md:flex-row">
      <main className="flex-1 min-w-0 md:ml-2 py-2 md:py-2">
        <ComplexDetail
          info={info}
          areas={["전체", ...areaDealData.map((a) => a.area)]}
          areaDealData={areaDealData}
        />
      </main>
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