"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { trackAptDetail } from '@/lib/gtag';
import Link from 'next/link';
import axios from 'axios'; // axios 추가
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Suspense } from "react";

interface Deal {
  id: string;
  region: string;
  address: string;
  area: number;
  price: number;
  date: string;
  aptName: string;
  floor: number;
  aptDong?: string; // 동 정보 (빈값일 수 있음)
  buildYear: number;
  dealMonth: number;
  dealDay: number;
  tradeType: string;
  cdealType: string;
}
interface RentDeal {
  id: string;
  region: string;
  aptName: string;
  area: number;
  deposit: number;
  rent: number;
  date: string;
  rentType: string;
  buildYear: number;
}

function RegionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 검색 파라미터 가져오기
  const sido = searchParams.get('sido') || '';
  const sigungu = searchParams.get('sigungu') || '';
  const dongParam = searchParams.get('dong') || '';
  
  const [deals, setDeals] = useState<(Deal|RentDeal)[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAptName, setSelectedAptName] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<number | string | null>(null);
  // dong state를 name(한글)로 관리
  const [dong, setDong] = useState<string>("");
  // 동 옵션 상태는 반드시 함수 내부에서 선언
  const [dongOptions, setDongOptions] = useState<{ code: string; name: string }[]>([]);
  const [sortField, setSortField] = useState<'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 캐시 관련 상태 (사용하지 않음 - 향후 기능 확장을 위해 유지)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isFromCache, setIsFromCache] = useState(false);

  // sidebarOnly 쿼리 파라미터가 있으면 사이드바만 보이기
  const sidebarOnly = searchParams.get('sidebarOnly') === '1';

  // 검색 지역 표시 텍스트 생성
  const getSearchLocationText = () => {
    if (sido && sigungu && dongParam) {
      return `${sido} ${sigungu} ${dongParam}`;
    } else if (sido && sigungu) {
      return `${sido} ${sigungu} 전체`;
    } else if (sido) {
      return `${sido} 전체`;
    }
    return '전국';
  };

  // 캐시 관련 유틸리티 함수들
  const generateCacheKey = (sido: string, sigungu: string, dong: string | null, startDate: string, endDate: string, dealType: string | null) => {
    return `deals_${sido}_${sigungu}_${dong || 'all'}_${startDate}_${endDate}_${dealType || 'trade'}`;
  };

  const getCachedDeals = (cacheKey: string) => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // 캐시 유효기간: 30분
        const now = Date.now();
        const cacheAge = now - timestamp;
        const cacheExpiry = 30 * 60 * 1000; // 30분
        
        if (cacheAge < cacheExpiry) {
          return data;
        } else {
          // 만료된 캐시 삭제
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.error('캐시 읽기 오류:', error);
    }
    return null;
  };

  const setCachedDeals = (cacheKey: string, data: (Deal|RentDeal)[]) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('캐시 저장 오류:', error);
    }
  };

  // 거래 데이터 조회 (API 호출 경로를 /api/deals로 고정)
  const loadDeals = useCallback(async (sido: string, sigungu: string, dong: string | null, startDate: string, endDate: string, dealType: string | null, useCache: boolean = false) => {
    const cacheKey = generateCacheKey(sido, sigungu, dong, startDate, endDate, dealType);
    
    // 캐시 사용이 허용된 경우에만 캐시 확인
    if (useCache) {
      const cachedData = getCachedDeals(cacheKey);
      if (cachedData) {
        setDeals(cachedData);
        setIsFromCache(true);
        return;
      }
    }

    setLoading(true);
    setIsFromCache(false);
    
    try {
      const params: Record<string, string> = { sido, sigungu, startDate, endDate };
      if (dong) params.dong = dong;
      if (dealType === 'rent') {
        const res = await axios.get('/api/rent', { params });
        setDeals(res.data);
        setCachedDeals(cacheKey, res.data);
      } else {
        if (dealType) params.dealType = dealType;
        const res = await axios.get('/api/deals', { params });
        setDeals(res.data);
        setCachedDeals(cacheKey, res.data);
      }
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // URL 파라미터에서 검색 조건 가져오기
    const sido = searchParams.get('sido');
    const sigungu = searchParams.get('sigungu');
    const dongParam = searchParams.get('dong');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dealType = searchParams.get('dealType');
    const isLoading = searchParams.get('loading') === 'true';

    // 로딩 상태가 URL 파라미터로 전달된 경우 즉시 로딩 시작
    if (isLoading) {
      setLoading(true);
      // URL에서 loading 파라미터 제거
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('loading');
      router.replace(`/region/?${newParams.toString()}`);
    }

    // 동 옵션 불러오기 (시도와 시군구가 있을 때만)
    if (sido && sigungu) {
      axios.get<{ code: string; name: string }[]>(`/api/regions/neighborhoods`, { params: { province: sido, city: sigungu } }).then(res => {
        setDongOptions([{ code: "ALL", name: "전체" }, ...res.data]);
      });
    } else {
      setDongOptions([]);
    }

    // dong state를 name(한글)로 세팅
    if (dongParam) setDong(dongParam);
    else setDong("");

    if (sido && sigungu && startDate && endDate) {
      // 뒤로가기나 페이지 새로고침 시에만 캐시 사용
      const isBackNavigation = !isLoading; // loading 파라미터가 없으면 뒤로가기로 간주
      loadDeals(sido, sigungu, dongParam, startDate, endDate, dealType, isBackNavigation);
    }
  }, [searchParams, loadDeals, router]);

  // 정렬된/필터된 거래 리스트 useMemo로 관리
  const filteredDeals = useMemo(() => {
    let result = [...deals];
    // 1. 필터링
    if (selectedAptName) {
      result = result.filter(deal =>
        deal.aptName === selectedAptName &&
        (selectedArea === null || deal.area === selectedArea)
      );
    } else if (dong && dong !== "전체") {
      result = result.filter(deal =>
        (deal.region && deal.region.includes(dong)) ||
        ('address' in deal && deal.address && String(deal.address).includes(dong))
      );
    }
    // 2. 정렬
    if (sortField) {
      result.sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';
        switch (sortField) {
          case 'price':
          case 'area':
          case 'buildYear':
          case 'deposit':
            aValue = (a as Deal)[sortField as keyof Deal] ?? (a as RentDeal)[sortField as keyof RentDeal] ?? '';
            bValue = (b as Deal)[sortField as keyof Deal] ?? (b as RentDeal)[sortField as keyof RentDeal] ?? '';
            break;
          case 'date':
            aValue = new Date((a as Deal).date ?? (a as RentDeal).date).getTime();
            bValue = new Date((b as Deal).date ?? (b as RentDeal).date).getTime();
            break;
          default:
            aValue = (a as Deal)[sortField as keyof Deal] ?? (a as RentDeal)[sortField as keyof RentDeal] ?? '';
            bValue = (b as Deal)[sortField as keyof Deal] ?? (b as RentDeal)[sortField as keyof RentDeal] ?? '';
        }
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [deals, selectedAptName, selectedArea, dong, sortField, sortOrder]);

  // 페이지네이션 적용된 거래 리스트
  const totalPages = Math.ceil(filteredDeals.length / itemsPerPage);
  const pagedDeals = filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 거래내역 영역 ref (모바일에서 페이지 변경 시 스크롤)
  const dealsSectionRef = useRef<HTMLDivElement>(null);
  const changePage = (newPage: number) => {
    setCurrentPage(newPage);
    if (dealsSectionRef.current && window.innerWidth < 1024) {
      dealsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  // 거래/필터 변경 시 1페이지로 이동
  useEffect(() => { setCurrentPage(1); }, [filteredDeals]);

  // 동 이름 normalize 함수
  function normalizeName(name: string) {
    return (name || '').replace(/\s/g, '').toLowerCase();
  }

  // 드랍다운(단지명, 면적) 옵션: dong과 정확히 일치하는 거래만 기준
  const dongFilteredDeals = useMemo(() => {
    if (!dong || dong === '전체') return deals;
    return deals.filter(deal => {
      const regionTokens = (deal.region || '').split(' ');
      const dealDong = regionTokens[regionTokens.length - 1];
      return normalizeName(dealDong) === normalizeName(dong);
    });
  }, [deals, dong]);

  // 단지명 옵션: 동 필터링된 데이터에서 생성
  const availableAptNames = Array.from(new Set(dongFilteredDeals.map(deal => deal.aptName)));

  // 면적 옵션: 단지 선택 여부에 따라 다르게 생성
  const availableAreas = useMemo(() => {
    if (selectedAptName) {
      // 단지가 선택된 경우: 해당 단지의 면적만 보여줌
      return Array.from(new Set(
        dongFilteredDeals
          .filter(deal => deal.aptName === selectedAptName)
          .map(deal => deal.area)
      )).sort((a, b) => a - b);
    } else {
      // 전체 단지 선택된 경우: 동 필터링된 모든 면적 보여줌
      return Array.from(new Set(dongFilteredDeals.map(deal => deal.area))).sort((a, b) => a - b);
    }
  }, [dongFilteredDeals, selectedAptName]);

  const formatPrice = (price: number) => {
    if (price === 0) return '0원';
    const eok = Math.floor(price / 10000);
    const chun = price % 10000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += `${chun.toLocaleString()}만원`;
    return result || '0원';
  };

  // 정렬 아이콘 렌더링 함수 (return 문 바로 위)
  const getSortIcon = (field: 'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit') => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  // 정렬 토글 함수 (return 문 바로 위)
  const toggleSort = (field: 'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  if (sidebarOnly) {
    return <Sidebar />;
  }
  return (
    <div className="container mx-auto px-4 py-8">
      {/* 헤더 */}
      {/* 모바일에서만 상단 뒤로가기 버튼 */}
      <div className="block lg:hidden mb-2">
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("sidebarOnly", "1");
            router.replace(`/region?${params.toString()}`);
          }}
          className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 shadow"
        >
          &larr; 뒤로가기
        </button>
      </div>

      {/* 검색 지역 표시 */}
      <div className="mb-2 p-2 bg-blue-50 rounded-md border border-blue-200">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
          <span className="text-sm font-medium text-blue-800 truncate">
            검색 지역: {getSearchLocationText()}
          </span>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-2 p-2 bg-white rounded-md border shadow-sm">
        {/* 모바일/전체: 가로 스크롤 필터 */}
        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          <div className="min-w-[120px] flex-shrink-0">
            <label className="text-xs font-medium mb-1 block text-gray-700">단지명</label>
            <Select 
              value={selectedAptName || ''} 
              onValueChange={(value) => setSelectedAptName(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="전체 단지" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 단지</SelectItem>
                {availableAptNames.sort((a, b) => a.localeCompare(b, 'ko')).map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[110px] flex-shrink-0">
            <label className="text-xs font-medium mb-1 block text-gray-700">면적</label>
            <Select 
              value={selectedArea?.toString() || ''} 
              onValueChange={(value) => setSelectedArea(value === 'all' ? null : Number(value))}
            >
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="전체 면적" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 면적</SelectItem>
                {availableAreas.map(area => (
                  <SelectItem key={area} value={area.toString()}>
                    {area}㎡
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[110px] flex-shrink-0">
            <label className="text-xs font-medium mb-1 block text-gray-700">읍면동</label>
            <Select value={dong} onValueChange={setDong}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="읍면동 선택" />
              </SelectTrigger>
              <SelectContent>
                {dongOptions.map(opt => (
                  <SelectItem key={opt.code} value={opt.name}>{opt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 모바일 정렬 버튼: 거래내역 위 */}
      <div className="lg:hidden flex flex-row flex-wrap gap-2 mb-4">
        <Button
          size="sm"
          variant={sortField === 'area' ? 'default' : 'outline'}
          onClick={() => toggleSort('area')}
          className="text-xs"
        >
          전용면적 {getSortIcon('area')}
        </Button>
        {searchParams.get('dealType') === 'rent' ? (
          <Button
            size="sm"
            variant={sortField === 'deposit' ? 'default' : 'outline'}
            onClick={() => toggleSort('deposit')}
            className="text-xs"
          >
            보증금 {getSortIcon('deposit')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant={sortField === 'price' ? 'default' : 'outline'}
            onClick={() => toggleSort('price')}
            className="text-xs"
          >
            거래금액 {getSortIcon('price')}
          </Button>
        )}
        <Button
          size="sm"
          variant={sortField === 'date' ? 'default' : 'outline'}
          onClick={() => toggleSort('date')}
          className="text-xs"
        >
          계약일 {getSortIcon('date')}
        </Button>
        {searchParams.get('dealType') !== 'rent' && (
          <Button
            size="sm"
            variant={sortField === 'cdealType' ? 'default' : 'outline'}
            onClick={() => toggleSort('cdealType')}
            className="text-xs"
          >
            계약해제 {getSortIcon('cdealType')}
          </Button>
        )}
        <Button
          size="sm"
          variant={sortField === 'buildYear' ? 'default' : 'outline'}
          onClick={() => toggleSort('buildYear')}
          className="text-xs"
        >
          건축년도 {getSortIcon('buildYear')}
        </Button>
      </div>

      {/* 검색 결과 */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
              <div className="text-lg font-semibold text-blue-600">데이터를 불러오는 중입니다...</div>
            </div>
          </CardContent>
        </Card>
      ) : filteredDeals.length > 0 ? (
        <>
          {/* PC: 테이블 */}
          <div className="hidden lg:block" ref={dealsSectionRef}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  거래 내역
                  {selectedAptName && ` - ${selectedAptName}`}
                  {selectedArea && ` (${selectedArea}㎡)`}
                  <span className="text-sm font-bold text-blue-600 ml-2">
                    {filteredDeals.length}건
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {searchParams.get('dealType') === 'rent' ? (
                    <table className="min-w-full text-xs border">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 border text-center">지역</th>
                          <th className="px-3 py-2 border text-center">단지명</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('area')}>
                            <div className="flex items-center justify-center gap-1">
                              전용면적
                              {getSortIcon('area')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('deposit')}>
                            <div className="flex items-center justify-center gap-1">
                              보증금
                              {getSortIcon('deposit')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">월세금액</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('date')}>
                            <div className="flex items-center justify-center gap-1">
                              계약일
                              {getSortIcon('date')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">계약유형</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('buildYear')}>
                            <div className="flex items-center justify-center gap-1">
                              건축년도
                              {getSortIcon('buildYear')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">단지상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pagedDeals as RentDeal[]).map((deal) => (
                          <tr key={deal.id} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 border text-center">{deal.region}</td>
                            <td className="px-3 py-2 border text-center font-semibold">{deal.aptName}</td>
                            <td className="px-3 py-2 border text-center">{deal.area}㎡</td>
                            <td className="px-3 py-2 border text-center text-blue-600 font-bold">{formatPrice(deal.deposit)}</td>
                            <td className="px-3 py-2 border text-center">
                              {deal.rent === 0 ? (
                                <span className="text-gray-500 text-xs">전세</span>
                              ) : (
                                <span className="text-red-600 font-medium text-xs">{formatPrice(deal.rent)}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 border text-center">{deal.date}</td>
                            <td className="px-3 py-2 border text-center">{deal.rentType}</td>
                            <td className="px-3 py-2 border text-center">{deal.buildYear}</td>
                            <td className="px-3 py-2 border text-center">
                              <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=rent`}>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => trackAptDetail(deal.aptName)}
                                >
                                  <TrendingUp className="w-4 h-4 mr-1" />단지상세
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="min-w-full text-xs border">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 border text-center">지역</th>
                          <th className="px-3 py-2 border text-center">단지명</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('area')}>
                            <div className="flex items-center justify-center gap-1">
                              전용면적
                              {getSortIcon('area')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">동</th>
                          <th className="px-3 py-2 border text-center">층</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('price')}>
                            <div className="flex items-center justify-center gap-1">
                              거래금액
                              {getSortIcon('price')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('date')}>
                            <div className="flex items-center justify-center gap-1">
                              계약일
                              {getSortIcon('date')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">거래유형</th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('cdealType')}>
                            <div className="flex items-center justify-center gap-1">
                              계약해제
                              {getSortIcon('cdealType')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('buildYear')}>
                            <div className="flex items-center justify-center gap-1">
                              건축년도
                              {getSortIcon('buildYear')}
                            </div>
                          </th>
                          <th className="px-3 py-2 border text-center">단지상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDeals.map((deal) => (
                          <tr key={deal.id} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 border text-center">{deal.region}</td>
                            <td className="px-3 py-2 border text-center font-semibold">{deal.aptName}</td>
                            <td className="px-3 py-2 border text-center">{deal.area}㎡</td>
                            <td className="px-3 py-2 border text-center">{'aptDong' in deal ? (deal.aptDong || '') : ''}</td>
                            <td className="px-3 py-2 border text-center">{'floor' in deal ? `${deal.floor}층` : ''}</td>
                            <td className="px-3 py-2 border text-center text-blue-600 font-bold">{'price' in deal ? formatPrice(deal.price ?? 0) : ''}</td>
                            <td className="px-3 py-2 border text-center">{deal.date}</td>
                            <td className="px-3 py-2 border text-center">{'tradeType' in deal ? deal.tradeType : ''}</td>
                            <td className="px-3 py-2 border text-center">{'cdealType' in deal ? deal.cdealType : ''}</td>
                            <td className="px-3 py-2 border text-center">{'buildYear' in deal ? deal.buildYear : ''}</td>
                            <td className="px-3 py-2 border text-center">
                              <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=${encodeURIComponent(searchParams.get('dealType') ?? 'trade')}`}>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => trackAptDetail(deal.aptName)}
                                >
                                  <TrendingUp className="w-4 h-4 mr-1" />단지상세
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* 페이지네이션 PC */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changePage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      이전
                    </Button>
                    <span className="text-sm text-gray-600">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      다음
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          {/* 모바일: 카드형 */}
          <div className="block lg:hidden" ref={dealsSectionRef}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  거래 내역
                  {selectedAptName && ` - ${selectedAptName}`}
                  {selectedArea && ` (${selectedArea}㎡)`}
                  <span className="text-sm font-bold text-blue-600 ml-2">
                    {filteredDeals.length}건
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-12 min-h-[70vh]">
                <div className="space-y-2 text-xs">
                  {pagedDeals.map((deal) => (
                    <div key={deal.id} className="border rounded-lg p-2 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <h3 className="font-semibold text-sm">{deal.aptName}</h3>
                          <p className="text-xs text-gray-600">{deal.region}</p>
                        </div>
                        <div className="text-right">
                          {searchParams.get('dealType') === 'rent' ? (
                            <div>
                              <div className="font-bold text-blue-600 text-base">
                                {'deposit' in deal ? formatPrice(deal.deposit ?? 0) : ''}
                              </div>
                              <div className="text-xs">
                                {'rent' in deal && deal.rent === 0 ? (
                                  <span className="text-gray-500">전세</span>
                                ) : (
                                  <span className="text-red-600 font-medium">
                                    {'rent' in deal ? `월세 ${formatPrice(deal.rent ?? 0)}` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="font-bold text-blue-600 text-base">
                              {'price' in deal ? formatPrice(deal.price ?? 0) : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs text-gray-600">
                        <div>면적: {deal.area}㎡</div>
                        {searchParams.get('dealType') !== 'rent' && (
                          <div>동: {'aptDong' in deal ? (deal.aptDong || '') : ''}</div>
                        )}
                        <div>층: {'floor' in deal ? `${deal.floor}층` : ''}</div>
                        <div>계약일: {deal.date}</div>
                        <div>거래유형: {'tradeType' in deal ? deal.tradeType : ''}</div>
                        <div>계약해제: {'cdealType' in deal ? deal.cdealType : ''}</div>
                        <div>건축년도: {'buildYear' in deal ? deal.buildYear : ''}</div>
                      </div>
                      <div className="mt-2">
                        <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=${encodeURIComponent(searchParams.get('dealType') ?? 'trade')}`}>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-7 px-2 text-xs"
                            onClick={() => trackAptDetail(deal.aptName)}
                          >
                            <TrendingUp className="w-3 h-3 mr-1" />
                            단지 상세
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
                {/* 페이지네이션 모바일 */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-4 mb-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changePage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      이전
                    </Button>
                    <span className="text-xs text-gray-600">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      다음
                    </Button>
                  </div>
                )}
                <div className="h-20" />
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-gray-500">검색 결과가 없습니다.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RegionPageWithSuspense() {
  return (
          <Suspense>
        <RegionPage />
      </Suspense>
  );
}