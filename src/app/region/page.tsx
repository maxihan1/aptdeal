/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { trackAptDetail } from '@/lib/gtag';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Suspense } from "react";
import { DealCard } from "@/components/region/deal-card";

interface Deal {
  id: string;
  region: string;
  address: string;
  area: number;
  price: number;
  date: string;
  aptName: string;
  floor: number;
  aptDong?: string;
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

  // URL에서 초기값 가져오기
  const initialSido = searchParams.get('sido') || '';
  const initialSigungu = searchParams.get('sigungu') || '';
  const initialDong = searchParams.get('dong') || '';
  const initialStartDate = searchParams.get('startDate') || '2023-01-01';
  const initialEndDate = searchParams.get('endDate') || '2023-12-31';

  // 상태 관리
  const [sido, setSido] = useState(initialSido);
  const [sigungu, setSigungu] = useState(initialSigungu);
  const [dong, setDong] = useState(initialDong);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  const [deals, setDeals] = useState<(Deal | RentDeal)[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAptName, setSelectedAptName] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<number | string | null>(null);

  // 드롭다운 옵션 상태
  const [sidoOptions, setSidoOptions] = useState<{ code: string; name: string }[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<{ code: string; name: string }[]>([]);
  const [dongOptions, setDongOptions] = useState<{ code: string; name: string }[]>([]);

  const [sortField, setSortField] = useState<'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const sidebarOnly = searchParams.get('sidebarOnly') === '1';

  // 캐시 키 생성 및 관리
  const generateCacheKey = (sido: string, sigungu: string, dong: string | null, startDate: string, endDate: string, dealType: string | null) => {
    return `deals_${sido}_${sigungu}_${dong || 'all'}_${startDate}_${endDate}_${dealType || 'trade'}`;
  };

  const getCachedDeals = (cacheKey: string) => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        const cacheAge = now - timestamp;
        const cacheExpiry = 30 * 60 * 1000; // 30분
        if (cacheAge < cacheExpiry) return data;
        localStorage.removeItem(cacheKey);
      }
    } catch (error) {
      console.error('캐시 읽기 오류:', error);
    }
    return null;
  };

  const setCachedDeals = (cacheKey: string, data: (Deal | RentDeal)[]) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (error) {
      console.error('캐시 저장 오류:', error);
    }
  };

  // 데이터 로드 함수
  const loadDeals = useCallback(async (sido: string, sigungu: string, dong: string | null, startDate: string, endDate: string, dealType: string | null, useCache: boolean = false) => {
    const cacheKey = generateCacheKey(sido, sigungu, dong, startDate, endDate, dealType);

    if (useCache) {
      const cachedData = getCachedDeals(cacheKey);
      if (cachedData) {
        setDeals(cachedData);
        return;
      }
    }

    setLoading(true);

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

  // 초기 로드 및 URL 파라미터 동기화
  useEffect(() => {
    // URL 파라미터가 변경되면 상태 업데이트
    const pSido = searchParams.get('sido') || '';
    const pSigungu = searchParams.get('sigungu') || '';
    const pDong = searchParams.get('dong') || '';
    const pStartDate = searchParams.get('startDate') || '2023-01-01';
    const pEndDate = searchParams.get('endDate') || '2023-12-31';

    setSido(pSido);
    setSigungu(pSigungu);
    setDong(pDong);
    setStartDate(pStartDate);
    setEndDate(pEndDate);

    const dealType = searchParams.get('dealType');
    const isLoading = searchParams.get('loading') === 'true';

    // 로딩 처리
    if (isLoading) {
      setLoading(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete('loading');
      router.replace(`/region?${newParams.toString()}`);
    }

    if (pSido && pSigungu && pStartDate && pEndDate) {
      // loading 플래그가 없으면 뒤로가기 등으로 간주하여 캐시 사용 시도
      const useCache = !isLoading;
      loadDeals(pSido, pSigungu, pDong, pStartDate, pEndDate, dealType, useCache);
    }
  }, [searchParams, loadDeals, router]);

  // 옵션 데이터 로드
  useEffect(() => {
    axios.get('/api/regions/provinces').then(res => setSidoOptions(res.data));
  }, []);

  useEffect(() => {
    if (sido) {
      axios.get('/api/regions/cities', { params: { province: sido } }).then(res => setSigunguOptions(res.data));
    } else {
      setSigunguOptions([]);
    }
  }, [sido]);

  useEffect(() => {
    if (sido && sigungu) {
      axios.get('/api/regions/neighborhoods', { params: { province: sido, city: sigungu } }).then(res => {
        setDongOptions([{ code: "ALL", name: "전체" }, ...res.data]);
      });
    } else {
      setDongOptions([]);
    }
  }, [sido, sigungu]);

  // 핸들러 함수들
  const handleSidoChange = (value: string) => {
    setSido(value);
    setSigungu('');
    setDong('');
    const params = new URLSearchParams(searchParams.toString());
    params.set('sido', value);
    params.delete('sigungu');
    params.delete('dong');
    router.push(`/region?${params.toString()}`);
  };

  const handleSigunguChange = (value: string) => {
    setSigungu(value);
    setDong('');
    const params = new URLSearchParams(searchParams.toString());
    params.set('sigungu', value);
    params.delete('dong');
    params.set('loading', 'true'); // 데이터 로드 트리거
    router.push(`/region?${params.toString()}`);
  };

  const handleDongChange = (value: string) => {
    setDong(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set('dong', value);
    params.set('loading', 'true');
    router.push(`/region?${params.toString()}`);
  };

  // 모바일 필터 적용 핸들러
  const handleApplyFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (sido) params.set('sido', sido);
    if (sigungu) params.set('sigungu', sigungu);
    if (dong && dong !== '전체') params.set('dong', dong); else params.delete('dong');
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (selectedAptName && selectedAptName !== 'all') {
      // 단지명 필터는 클라이언트 사이드 필터링이므로 URL에 넣을지 결정 필요
      // 여기서는 클라이언트 상태만 유지하거나, 필요시 URL에 추가 (현재 로직은 클라이언트 필터 위주)
    }
    params.set('loading', 'true');
    router.push(`/region?${params.toString()}`);
  };

  // 데이터 필터링 및 정렬 logic
  const normalizeName = (name: string) => (name || '').replace(/\s/g, '').toLowerCase();

  const dongFilteredDeals = useMemo(() => {
    if (!dong || dong === '전체') return deals;
    return deals.filter(deal => {
      const regionTokens = (deal.region || '').split(' ');
      const dealDong = regionTokens[regionTokens.length - 1];
      return normalizeName(dealDong) === normalizeName(dong);
    });
  }, [deals, dong]);

  const availableAptNames = useMemo(() =>
    Array.from(new Set(dongFilteredDeals.map(d => d.aptName))).sort((a, b) => a.localeCompare(b, 'ko'))
    , [dongFilteredDeals]);

  const availableAreas = useMemo(() => {
    const target = selectedAptName ? dongFilteredDeals.filter(d => d.aptName === selectedAptName) : dongFilteredDeals;
    return Array.from(new Set(target.map(d => d.area))).sort((a, b) => a - b);
  }, [dongFilteredDeals, selectedAptName]);

  const filteredDeals = useMemo(() => {
    let result = [...deals];
    if (selectedAptName) {
      result = result.filter(deal => deal.aptName === selectedAptName);
    }
    if (selectedArea) {
      result = result.filter(deal => deal.area === selectedArea);
    }
    if (dong && dong !== "전체") {
      result = result.filter(deal => {
        const regionTokens = (deal.region || '').split(' ');
        const dealDong = regionTokens[regionTokens.length - 1];
        return normalizeName(dealDong) === normalizeName(dong);
      });
    }

    if (sortField) {
      result.sort((a, b) => {
        let aValue: string | number = '';
        let bValue: string | number = '';
        switch (sortField) {
          case 'price':
          case 'area':
          case 'buildYear':
          case 'deposit':
            aValue = (a as any)[sortField] ?? '';
            bValue = (b as any)[sortField] ?? '';
            break;
          case 'date':
            aValue = new Date((a as any).date).getTime();
            bValue = new Date((b as any).date).getTime();
            break;
          default:
            aValue = (a as any)[sortField] ?? '';
            bValue = (b as any)[sortField] ?? '';
        }
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [deals, selectedAptName, selectedArea, dong, sortField, sortOrder]);

  // 페이지네이션
  useEffect(() => { setCurrentPage(1); }, [filteredDeals]);
  const totalPages = Math.ceil(filteredDeals.length / itemsPerPage);
  const pagedDeals = filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const changePage = (newPage: number) => {
    setCurrentPage(newPage);
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  const toggleSort = (field: any) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '0원';
    const eok = Math.floor(price / 10000);
    const chun = price % 10000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += ` ${chun.toLocaleString()}만원`;
    else if (eok > 0) result = result.trim();
    return result || '0원';
  };

  const getSearchLocationText = () => {
    if (sido && sigungu && dong) return `${sido} ${sigungu} ${dong}`;
    if (sido && sigungu) return `${sido} ${sigungu} 전체`;
    if (sido) return `${sido} 전체`;
    return '전국';
  };

  if (sidebarOnly) return <Sidebar />;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 뒤로가기 (모바일) */}
      <div className="block lg:hidden mb-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>&larr; 뒤로가기</Button>
      </div>

      {/* 검색 지역 표시 */}
      <div className="mb-2 p-2 bg-muted rounded-md border border-border">
        <span className="text-sm font-medium text-foreground">
          검색 지역: {getSearchLocationText()}
        </span>
      </div>

      {/* 필터 영역 */}
      <div className="mb-4">
        {/* Desktop Filter */}
        <div className="hidden lg:flex flex-row gap-2 bg-card p-4 rounded-lg border shadow-sm items-center flex-wrap">
          <Select value={sido} onValueChange={handleSidoChange}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="시/도" /></SelectTrigger>
            <SelectContent>{sidoOptions.map(o => <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sigungu} onValueChange={handleSigunguChange} disabled={!sido}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="시/군/구" /></SelectTrigger>
            <SelectContent>{sigunguOptions.map(o => <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={dong} onValueChange={handleDongChange} disabled={!sigungu}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="읍/면/동" /></SelectTrigger>
            <SelectContent>
              {dongOptions.map(o => <SelectItem key={o.code} value={o.name}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* 날짜 필터도 여기에 추가 가능 */}
        </div>

        {/* Mobile Filter Button */}
        <div className="lg:hidden">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> 필터 / 검색 설정</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto mx-auto">
              <DialogHeader><DialogTitle>검색 필터</DialogTitle></DialogHeader>
              <div className="space-y-4 pb-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">지역</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={sido} onValueChange={setSido}>
                      <SelectTrigger><SelectValue placeholder="시/도" /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">{sidoOptions.map(o => <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={sigungu} onValueChange={(val) => { setSigungu(val); setSido(sido); /* trigger effect */ }} disabled={!sido}>
                      <SelectTrigger><SelectValue placeholder="시/군/구" /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">{sigunguOptions.map(o => <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Select value={dong} onValueChange={setDong} disabled={!sigungu}>
                    <SelectTrigger><SelectValue placeholder="읍/면/동" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">{dongOptions.map(o => <SelectItem key={o.code} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">기간</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">단지명</label>
                  <Select value={selectedAptName || 'all'} onValueChange={v => setSelectedAptName(v === 'all' ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="전체 단지" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="all">전체 단지</SelectItem>
                      {availableAptNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">면적</label>
                  <Select value={selectedArea?.toString() || 'all'} onValueChange={v => setSelectedArea(v === 'all' ? null : Number(v))}>
                    <SelectTrigger><SelectValue placeholder="전체 면적" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="all">전체 면적</SelectItem>
                      {availableAreas.map(a => <SelectItem key={a} value={a.toString()}>{a}㎡</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogClose asChild>
                  <Button className="w-full mt-2" onClick={handleApplyFilter}>필터 적용하기</Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 정렬 버튼들 (Mobile) */}
      <div className="lg:hidden flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant={sortField === 'area' ? 'default' : 'outline'} onClick={() => toggleSort('area')}>전용면적 {getSortIcon('area')}</Button>
        <Button size="sm" variant={sortField === 'price' ? 'default' : 'outline'} onClick={() => toggleSort('price')}>가격 {getSortIcon('price')}</Button>
        <Button size="sm" variant={sortField === 'date' ? 'default' : 'outline'} onClick={() => toggleSort('date')}>날짜 {getSortIcon('date')}</Button>
      </div>

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

      {/* 결과 리스트 */}
      {filteredDeals.length > 0 ? (
        <>
          {/* Pagination Component */}
          {(() => {
            const paginationComponent = (
              <div className="flex flex-wrap justify-center items-center gap-2 mt-4 pb-4 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none min-w-[3rem]"
                  onClick={() => changePage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  이전
                </Button>
                <span className="py-1 px-3 text-sm whitespace-nowrap font-medium min-w-[4rem] text-center">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none min-w-[3rem]"
                  onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  다음
                </Button>
              </div>
            );

            return (
              <>
                {/* PC Table View */}
                <div className="hidden lg:block">
                  <Card>
                    <CardHeader><CardTitle>거래 내역 ({filteredDeals.length}건)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            {searchParams.get('dealType') === 'rent' ? (
                              <tr className="border-b bg-muted/30">
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">지역</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">단지명</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('area')}>
                                  <span className="inline-flex items-center justify-center gap-1">전용면적 {getSortIcon('area')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('deposit')}>
                                  <span className="inline-flex items-center justify-center gap-1">보증금 {getSortIcon('deposit')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">월세금액</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('date')}>
                                  <span className="inline-flex items-center justify-center gap-1">계약일 {getSortIcon('date')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('buildYear')}>
                                  <span className="inline-flex items-center justify-center gap-1">건축년도 {getSortIcon('buildYear')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">상세</th>
                              </tr>
                            ) : (
                              <tr className="border-b bg-muted/30">
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">지역</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">단지명</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('area')}>
                                  <span className="inline-flex items-center justify-center gap-1">전용면적 {getSortIcon('area')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">동</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">층</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('price')}>
                                  <span className="inline-flex items-center justify-center gap-1">거래금액 {getSortIcon('price')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('date')}>
                                  <span className="inline-flex items-center justify-center gap-1">계약일 {getSortIcon('date')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">거래유형</th>
                                <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort('buildYear')}>
                                  <span className="inline-flex items-center justify-center gap-1">건축년도 {getSortIcon('buildYear')}</span>
                                </th>
                                <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">단지상세</th>
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {pagedDeals.map((deal: any) => {
                              // cdealType이 'Y' 또는 'O'인 경우만 취소된 거래
                              const isCancelled = ['Y', 'O'].includes(deal.cdealType || '');
                              return (
                                <tr key={deal.id} className={`border-b hover:bg-muted/50 ${isCancelled ? 'bg-red-50/50 dark:bg-red-900/10 opacity-70' : ''}`}>
                                  {searchParams.get('dealType') === 'rent' ? (
                                    <>
                                      <td className="py-2 text-center px-2">{deal.region}</td>
                                      <td className="py-2 text-center font-bold px-2">
                                        {deal.aptName}
                                        {isCancelled && <span className="ml-1 text-xs text-red-500 font-normal">[취소]</span>}
                                      </td>
                                      <td className="py-2 text-center px-2">{deal.area}㎡</td>
                                      <td className={`py-2 text-center font-bold px-2 ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>{formatPrice(deal.deposit)}</td>
                                      <td className="py-2 text-center px-2">{deal.rent ? deal.rent.toLocaleString() + '만원' : '전세'}</td>
                                      <td className="py-2 text-center px-2">{deal.date}</td>
                                      <td className="py-2 text-center px-2">{deal.buildYear}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2 text-center px-2">{deal.region}</td>
                                      <td className="py-2 text-center font-bold px-2">
                                        {deal.aptName}
                                        {isCancelled && <span className="ml-1 text-xs text-red-500 font-normal">[취소]</span>}
                                      </td>
                                      <td className="py-2 text-center px-2">{deal.area}㎡</td>
                                      <td className="py-2 text-center px-2">{deal.aptDong || '-'}</td>
                                      <td className="py-2 text-center px-2">{deal.floor}층</td>
                                      <td className={`py-2 text-center font-bold px-2 ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>{formatPrice(deal.price)}</td>
                                      <td className="py-2 text-center px-2">{deal.date}</td>
                                      <td className="py-2 text-center px-2">{deal.tradeType || '-'}</td>
                                      <td className="py-2 text-center px-2">{deal.buildYear}</td>
                                    </>
                                  )}
                                  <td className="py-2 text-center px-2">
                                    <Link href={`/apt/${encodeURIComponent(deal.aptName)}?s=${encodeURIComponent(sido)}&g=${encodeURIComponent(sigungu)}&d=${encodeURIComponent(dong)}&t=${searchParams.get('dealType') || 'trade'}`}>
                                      <Button size="sm" variant="outline"><TrendingUp className="w-4 h-4 mr-1" /> 상세</Button>
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination inside Card for Desktop */}
                      {paginationComponent}
                    </CardContent>
                  </Card>
                </div>

                {/* Mobile List View */}
                <div className="lg:hidden space-y-2">
                  {pagedDeals.map((deal: any) => (
                    <Link key={deal.id} href={`/apt/${encodeURIComponent(deal.aptName)}?s=${encodeURIComponent(sido)}&g=${encodeURIComponent(sigungu)}&d=${encodeURIComponent(dong)}&t=${searchParams.get('dealType') || 'trade'}`}>
                      <DealCard deal={deal} />
                    </Link>
                  ))}
                  {/* Pagination for Mobile */}
                  {paginationComponent}
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <div className="text-center py-10 text-gray-500">거래 데이터가 없습니다.</div>
      )}
    </div>
  );
}

export default function PageWithSuspense() {
  return (
    <Suspense>
      <RegionPage />
    </Suspense>
  );
}