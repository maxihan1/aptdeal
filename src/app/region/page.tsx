"use client";
import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

  // sidebarOnly 쿼리 파라미터가 있으면 사이드바만 보이기
  const sidebarOnly = searchParams.get('sidebarOnly') === '1';

  useEffect(() => {
    // URL 파라미터에서 검색 조건 가져오기
    const sido = searchParams.get('sido');
    const sigungu = searchParams.get('sigungu');
    const dongParam = searchParams.get('dong');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const dealType = searchParams.get('dealType');

    // 동 옵션 불러오기 (시군구가 있을 때만)
    if (sigungu) {
      axios.get<{ code: string; name: string }[]>(`/api/regions/neighborhoods`, { params: { city: sigungu } }).then(res => {
        setDongOptions([{ code: "ALL", name: "전체" }, ...res.data]);
      });
    } else {
      setDongOptions([]);
    }

    // dong state를 name(한글)로 세팅
    if (dongParam) setDong(dongParam);
    else setDong("");

    if (sido && sigungu && startDate && endDate) {
      loadDeals(sido, sigungu, dongParam, startDate, endDate, dealType);
    }
  }, [searchParams]);

  // 거래 데이터 조회 (API 호출 경로를 /api/deals로 고정)
  const loadDeals = async (sido: string, sigungu: string, dong: string | null, startDate: string, endDate: string, dealType: string | null) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { sido, sigungu, startDate, endDate };
      if (dong) params.dong = dong;
      if (dealType === 'rent') {
        const res = await axios.get('/api/rent', { params });
        setDeals(res.data);
      } else {
        if (dealType) params.dealType = dealType;
        const res = await axios.get('/api/deals', { params });
        setDeals(res.data);
      }
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

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

  const availableAptNames = Array.from(new Set(dongFilteredDeals.map(deal => deal.aptName)));
  const availableAreas = Array.from(new Set(dongFilteredDeals.map(deal => deal.area))).sort((a, b) => a - b);

  const formatPrice = (price: number) => {
    const eok = Math.floor(price / 10000);
    const chun = price % 10000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += `${chun.toLocaleString()}만원`;
    return result;
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

  const router = useRouter();

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
      {/* 필터 */}
      <Card className="mb-2 rounded-md border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between p-1 pb-0" />
        <CardContent className="px-1 pt-1 pb-0">
            {/* 모바일/전체: 가로 스크롤 필터 */}
            <div className="flex flex-row gap-1 overflow-x-auto pb-0 mb-1">
              <div className="min-w-[120px]">
                <label className="text-xs font-medium mb-1 block">단지명</label>
                <Select 
                  value={selectedAptName || ''} 
                  onValueChange={(value) => setSelectedAptName(value === 'all' ? null : value)}
                >
                  <SelectTrigger className="w-full h-9 text-xs">
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
              <div className="min-w-[110px]">
                <label className="text-xs font-medium mb-1 block">면적</label>
                <Select 
                  value={selectedArea?.toString() || ''} 
                  onValueChange={(value) => setSelectedArea(value === 'all' ? null : Number(value))}
                >
                  <SelectTrigger className="w-full h-9 text-xs">
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
              <div className="min-w-[110px]">
                <label className="text-xs font-medium mb-1 block">읍면동</label>
                <Select value={dong} onValueChange={setDong}>
                  <SelectTrigger className="w-full h-9 text-xs">
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
          </CardContent>
      </Card>

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
        <Button
          size="sm"
          variant={sortField === 'price' ? 'default' : 'outline'}
          onClick={() => toggleSort('price')}
          className="text-xs"
        >
          거래금액 {getSortIcon('price')}
        </Button>
        <Button
          size="sm"
          variant={sortField === 'date' ? 'default' : 'outline'}
          onClick={() => toggleSort('date')}
          className="text-xs"
        >
          계약일 {getSortIcon('date')}
        </Button>
        <Button
          size="sm"
          variant={sortField === 'cdealType' ? 'default' : 'outline'}
          onClick={() => toggleSort('cdealType')}
          className="text-xs"
        >
          계약해제 {getSortIcon('cdealType')}
        </Button>
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
            <div className="text-center text-gray-500">로딩 중...</div>
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
                          <th className="px-3 py-2 border text-center">전용면적</th>
                          <th className="px-3 py-2 border text-center">보증금</th>
                          <th className="px-3 py-2 border text-center">월세금액</th>
                          <th className="px-3 py-2 border text-center">계약일</th>
                          <th className="px-3 py-2 border text-center">계약유형</th>
                          <th className="px-3 py-2 border text-center">건축년도</th>
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
                            <td className="px-3 py-2 border text-center text-blue-600 font-bold">{formatPrice(deal.rent)}</td>
                            <td className="px-3 py-2 border text-center">{deal.date}</td>
                            <td className="px-3 py-2 border text-center">{deal.rentType}</td>
                            <td className="px-3 py-2 border text-center">{deal.buildYear}</td>
                            <td className="px-3 py-2 border text-center">
                              <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=rent`}>
                                <Button size="sm" variant="outline">
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
                            <td className="px-3 py-2 border text-center">{'floor' in deal ? `${deal.floor}층` : ''}</td>
                            <td className="px-3 py-2 border text-center text-blue-600 font-bold">{'price' in deal ? formatPrice(deal.price ?? 0) : ''}</td>
                            <td className="px-3 py-2 border text-center">{deal.date}</td>
                            <td className="px-3 py-2 border text-center">{'tradeType' in deal ? deal.tradeType : ''}</td>
                            <td className="px-3 py-2 border text-center">{'cdealType' in deal ? deal.cdealType : ''}</td>
                            <td className="px-3 py-2 border text-center">{'buildYear' in deal ? deal.buildYear : ''}</td>
                            <td className="px-3 py-2 border text-center">
                              <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=${encodeURIComponent(searchParams.get('dealType') ?? 'trade')}`}>
                                <Button size="sm" variant="outline">
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
                        <span className="font-bold text-blue-600 text-base">
                          {'price' in deal ? formatPrice(deal.price ?? 0) : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs text-gray-600">
                        <div>면적: {deal.area}㎡</div>
                        <div>층: {'floor' in deal ? `${deal.floor}층` : ''}</div>
                        <div>계약일: {deal.date}</div>
                        <div>거래유형: {'tradeType' in deal ? deal.tradeType : ''}</div>
                        <div>계약해제: {'cdealType' in deal ? deal.cdealType : ''}</div>
                        <div>건축년도: {'buildYear' in deal ? deal.buildYear : ''}</div>
                      </div>
                      <div className="mt-2">
                        <Link href={`/region/${encodeURIComponent(deal.aptName)}?region=${encodeURIComponent(deal.region)}&sido=${encodeURIComponent(searchParams.get('sido') ?? '')}&sigungu=${encodeURIComponent(searchParams.get('sigungu') ?? '')}&dong=${encodeURIComponent(searchParams.get('dong') ?? '')}&startDate=${encodeURIComponent(searchParams.get('startDate') ?? '')}&endDate=${encodeURIComponent(searchParams.get('endDate') ?? '')}&dealType=${encodeURIComponent(searchParams.get('dealType') ?? 'trade')}`}>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
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