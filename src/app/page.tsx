"use client";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Star, Search, Home as HomeIcon, Calendar, Building2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import axios from "axios";

// 타입 정의
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
}

interface RegionOption {
  code: string;
  name: string;
}

export default function Home() {
  // 지역 옵션 상태 (함수 내부로 이동)
  const [sidoOptions, setSidoOptions] = useState<RegionOption[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<RegionOption[]>([]);
  const [dongOptions, setDongOptions] = useState<RegionOption[]>([]);

  // 즐겨찾기 LocalStorage 키
  const FAVORITE_KEY = "apt_favorites";

  // 필터 상태
  const [sido, setSido] = useState<string>("");
  const [sigungu, setSigungu] = useState<string>("");
  const [dong, setDong] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 데이터 상태
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<RegionOption[]>([]);

  // 정렬 상태
  const [sortField, setSortField] = useState<'price' | 'area' | 'date' | 'aptName'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 선택 예약 상태
  const [pendingSelect, setPendingSelect] = useState<{sido: string, sigungu: string, dong: string} | null>(null);

  // 페이지네이션 상태 추가
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // 정렬 함수
  const sortDeals = (deals: Deal[]) => {
    return [...deals].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      if (sortField === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      } else if (sortField === 'price' || sortField === 'area') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      } else {
        aValue = String(aValue);
        bValue = String(bValue);
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  // 정렬 토글 함수
  const toggleSort = (field: 'price' | 'area' | 'date' | 'aptName') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // 정렬 아이콘 렌더링
  const getSortIcon = (field: 'price' | 'area' | 'date' | 'aptName') => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  // 페이지네이션 계산
  const sortedDeals = sortDeals(deals);
  const totalPages = Math.ceil(sortedDeals.length / itemsPerPage);
  const pagedDeals = sortedDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 페이지 변경 시 스크롤 맨 위로 이동(선택)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // deals가 바뀌면 1페이지로 초기화
  useEffect(() => {
    setCurrentPage(1);
  }, [deals]);

  // 시도 불러오기
  useEffect(() => {
    axios.get<RegionOption[]>("http://localhost:4000/api/regions/sido").then(res => {
      setSidoOptions(res.data);
    });
  }, []);

  // 시군구 불러오기
  useEffect(() => {
    if (!sido) {
      setSigunguOptions([]);
      setDongOptions([]);
      setSigungu("");
      setDong("");
      return;
    }
    axios.get<RegionOption[]>("http://localhost:4000/api/regions/sigungu", { params: { sido } }).then(res => {
      setSigunguOptions(res.data);
      setSigungu("");
      setDongOptions([]);
      setDong("");
    });
  }, [sido]);

  // 읍면동 불러오기
  useEffect(() => {
    if (!sigungu) {
      setDongOptions([]);
      setDong("");
      return;
    }
    axios.get<RegionOption[]>("http://localhost:4000/api/regions/dong", { params: { sigungu } }).then(res => {
      setDongOptions(res.data);
      setDong("");
    });
  }, [sigungu]);

  // 즐겨찾기 불러오기
  useEffect(() => {
    const fav = localStorage.getItem(FAVORITE_KEY);
    if (fav) setFavorites(JSON.parse(fav));
  }, []);

  // 즐겨찾기 추가
  const addFavorite = () => {
    if (!sido || !sigungu || !dong) return;
    const region: RegionOption = { code: `${sido}-${sigungu}-${dong}`, name: `${sidoOptions.find(s=>s.code===sido)?.name} ${sigunguOptions.find(s=>s.code===sigungu)?.name} ${dongOptions.find(d=>d.code===dong)?.name}` };
    if (favorites.find(f => f.code === region.code)) return;
    const next = [...favorites, region];
    setFavorites(next);
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  };

  // 즐겨찾기 삭제
  const removeFavorite = (code: string) => {
    const next = favorites.filter(f => f.code !== code);
    setFavorites(next);
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  };

  // 즐겨찾기에서 선택 버튼 클릭 시 예약
  const handleFavoriteSelect = (favCode: string) => {
    const [sidoCode, sigunguCode, dongCode] = favCode.split("-");
    setPendingSelect({ sido: sidoCode, sigungu: sigunguCode, dong: dongCode });
  };

  // 시도 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && sidoOptions.length > 0) {
      if (sido !== pendingSelect.sido) setSido(pendingSelect.sido);
    }
  }, [pendingSelect, sidoOptions]);

  // 시군구 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && sigunguOptions.length > 0 && sido === pendingSelect.sido) {
      if (sigungu !== pendingSelect.sigungu) setSigungu(pendingSelect.sigungu);
    }
  }, [pendingSelect, sigunguOptions, sido]);

  // 읍면동 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && dongOptions.length > 0 && sigungu === pendingSelect.sigungu) {
      if (dong !== pendingSelect.dong) setDong(pendingSelect.dong);
      // 모두 선택 완료 후 예약 해제
      if (dongOptions.find(d => d.code === pendingSelect.dong)) {
        setPendingSelect(null);
      }
    }
  }, [pendingSelect, dongOptions, sigungu]);

  // 거래 데이터 조회
  const fetchDeals = async () => {
    if (!sido || !sigungu || !startDate || !endDate) return;
    setLoading(true);
    try {
      // 동 파라미터 없이 시/구 단위로만 조회
      const res = await axios.get<Deal[]>(`http://localhost:4000/api/deals`, {
        params: { sido, sigungu, startDate, endDate },
      });
      // 서버 응답을 Deal 타입에 맞게 매핑
      const mapped = res.data.map((item, idx) => ({
        id: item.id || `${sigungu}-${idx}`,
        region: item.region || '',
        address: item.address || '',
        area: item.area || 0,
        price: item.price || 0,
        date: item.date || '',
        aptName: item.aptName || '',
        floor: item.floor || '',
        buildYear: item.buildYear || '',
        dealMonth: item.dealMonth || '',
        dealDay: item.dealDay || '',
      }));
      // 동 필터링(프론트에서)
      let filtered = dong ? mapped.filter(deal => deal.region.includes(dong) || String(deal.address).includes(dong)) : mapped;
      // 일자 필터링(프론트에서)
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        filtered = filtered.filter(deal => {
          if (!deal.date) return false;
          const d = new Date(deal.date);
          return d >= start && d <= end;
        });
      }
      setDeals(filtered);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 영역 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs sm:text-sm">A</span>
              </div>
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900">APTDEAL</h1>
            </div>
            <div className="hidden sm:block text-sm text-gray-500">
              아파트 실거래가 조회 서비스
            </div>
            <div className="sm:hidden text-xs text-gray-500">
              실거래가 조회
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
          {/* 필터 & 즐겨찾기 */}
          <div className="flex flex-col gap-6 w-full lg:w-1/3">
            {/* 검색 필터 영역 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">🔍</span>
                  </div>
                  검색 조건
                </h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={sido} onValueChange={setSido}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="시도 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {sidoOptions.map(opt => (
                        <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sigungu} onValueChange={setSigungu} disabled={!sido}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="시군 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {sigunguOptions.map(opt => (
                        <SelectItem key={opt.code} value={opt.name}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dong} onValueChange={setDong} disabled={!sigungu}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="읍면동 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {dongOptions.map(opt => (
                        <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full" placeholder="시작일" />
                  <Input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="w-full" placeholder="종료일" />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={fetchDeals} disabled={loading} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white">
                    🔍 조회
                  </Button>
                  <Button variant="outline" onClick={addFavorite} disabled={!sido || !sigungu || !dong} className="w-full sm:w-auto border-yellow-300 text-yellow-700 hover:bg-yellow-50">
                    <Star className="w-4 h-4 mr-1" /> 즐겨찾기
                  </Button>
                </div>
              </div>
            </div>
            
            {/* 즐겨찾기 영역 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">⭐</span>
                  </div>
                  즐겨찾기 지역
                </h2>
              </div>
              <div className="p-4">
                {favorites.length === 0 ? (
                  <div className="text-gray-400 text-sm text-center py-4">등록된 즐겨찾기 지역이 없습니다.</div>
                ) : (
                  <ul className="space-y-2">
                    {favorites.map(fav => (
                      <li key={fav.code} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-2 p-2 bg-gray-50 rounded-lg border">
                        <span className="truncate font-medium">{fav.name}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleFavoriteSelect(fav.code)} className="flex-1 sm:flex-none text-xs">선택</Button>
                          <Button size="sm" variant="ghost" onClick={()=>removeFavorite(fav.code)} className="flex-1 sm:flex-none text-xs text-red-600 hover:text-red-700">삭제</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          
          {/* 거래 데이터 리스트 */}
          <div className="flex-1 flex flex-col gap-4">
            {/* 데이터 영역 헤더 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">📊</span>
                  </div>
                  거래 내역
                </h2>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="text-center text-gray-500">조회 중...</div>
                ) : deals.length === 0 ? (
                  <div className="text-center text-gray-400">조회 결과가 없습니다.</div>
                ) : (
                  <>
                    {/* 데스크톱 테이블 */}
                    <div className="hidden lg:block overflow-x-auto">
                      <div className="max-h-96 overflow-y-auto border rounded-lg">
                        <table className="min-w-full text-sm relative">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 border-b">
                              <th className="border px-2 py-1 bg-gray-100">지역</th>
                              <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('aptName')}>
                                <div className="flex items-center justify-between">
                                  단지명
                                  {getSortIcon('aptName')}
                                </div>
                              </th>
                              <th className="border px-2 py-1 bg-gray-100">층</th>
                              <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('area')}>
                                <div className="flex items-center justify-between">
                                  전용면적
                                  {getSortIcon('area')}
                                </div>
                              </th>
                              <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('price')}>
                                <div className="flex items-center justify-between">
                                  거래금액(만원)
                                  {getSortIcon('price')}
                                </div>
                              </th>
                              <th className="border px-2 py-1 bg-gray-100">계약 월</th>
                              <th className="border px-2 py-1 bg-gray-100">계약 일</th>
                              <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('date')}>
                                <div className="flex items-center justify-between">
                                  건축년도
                                  {getSortIcon('date')}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedDeals.map((deal) => (
                              <tr key={deal.id} className="even:bg-gray-50 hover:bg-gray-100 transition-colors">
                                <td className="border px-2 py-1">{deal.region}</td>
                                <td className="border px-2 py-1">{deal.aptName}</td>
                                <td className="border px-2 py-1">{deal.floor}</td>
                                <td className="border px-2 py-1">{deal.area}</td>
                                <td className="border px-2 py-1 font-medium text-blue-600">{deal.price}</td>
                                <td className="border px-2 py-1">{deal.dealMonth}</td>
                                <td className="border px-2 py-1">{deal.dealDay}</td>
                                <td className="border px-2 py-1">{deal.buildYear}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* 페이지네이션 */}
                      {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            다음
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* 모바일 카드 리스트 */}
                    <div className="lg:hidden space-y-3">
                      {deals.map((deal) => (
                        <div key={deal.id} className="bg-white border rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-gray-900 truncate">{deal.aptName}</h3>
                            <span className="text-lg font-bold text-blue-600">{deal.price}만원</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">지역:</span> {deal.region}
                            </div>
                            <div>
                              <span className="font-medium">층:</span> {deal.floor}층
                            </div>
                            <div>
                              <span className="font-medium">면적:</span> {deal.area}㎡
                            </div>
                            <div>
                              <span className="font-medium">계약일:</span> {deal.dealMonth}/{deal.dealDay}
                            </div>
                            <div className="col-span-2">
                              <span className="font-medium">건축년도:</span> {deal.buildYear}년
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
