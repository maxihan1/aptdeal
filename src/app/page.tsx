"use client";
import { useEffect, useState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Star, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon } from "lucide-react";
import axios from "axios";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
  tradeType?: string;
  dealingGbn?: string;
  cdealType?: string;
  '거래유형'?: string;
  '계약해제'?: string;
  deposit?: number;
  monthlyRent?: number;
  contractType?: string;
  [key: string]: string | number | undefined; // 인덱스 시그니처 수정
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
  const [selectedAptName, setSelectedAptName] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [dealType, setDealType] = useState<"trade" | "rent">("trade");

  // 데이터 상태
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<RegionOption[]>([]);

  // 정렬 상태
  const [sortField, setSortField] = useState<'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 선택 예약 상태
  const [pendingSelect, setPendingSelect] = useState<{sido: string, sigungu: string, dong: string} | null>(null);

  // 페이지네이션 상태 추가
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // 거래내역 영역 참조
  const dealsSectionRef = useRef<HTMLDivElement>(null);

  // 정렬 함수
  const sortDeals = (deals: Deal[]) => {
    return [...deals].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;
      
      if (sortField === 'date') {
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
      } else if (sortField === 'price' || sortField === 'area' || sortField === 'buildYear' || sortField === 'deposit') {
        aValue = Number(a[sortField]);
        bValue = Number(b[sortField]);
      } else if (sortField === 'cdealType') {
        aValue = String(a.cdealType || '');
        bValue = String(b.cdealType || '');
      } else {
        aValue = String(a[sortField]);
        bValue = String(b[sortField]);
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  // 정렬 토글 함수
  const toggleSort = (field: 'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // 정렬 아이콘 렌더링
  const getSortIcon = (field: 'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit') => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  // 필터링: 단지명+전용면적, 동, 전체
  const filteredDeals = selectedAptName
    ? sortDeals(deals).filter(deal =>
        deal.aptName === selectedAptName &&
        (selectedArea === null || deal.area === selectedArea)
      )
    : dong && dong !== "ALL"
      ? sortDeals(deals).filter(deal => deal.region.includes(dong) || String(deal.address).includes(dong))
      : sortDeals(deals);
  const totalPages = Math.ceil(filteredDeals.length / itemsPerPage);
  const pagedDeals = filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // deals가 바뀌면 1페이지로 초기화
  useEffect(() => {
    setCurrentPage(1);
  }, [deals]);

  // 전용면적 선택 시 1페이지로 이동
  useEffect(() => {
    if (selectedArea !== null) {
      setCurrentPage(1);
    }
  }, [selectedArea]);

  // dealType 변경 시 selectedAptName, selectedArea 초기화
  useEffect(() => {
    setSelectedAptName(null);
    setSelectedArea(null);
  }, [dealType]);

  // API 기본 URL 설정
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

  // 시도 불러오기
  useEffect(() => {
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/provinces`).then(res => {
      setSidoOptions(res.data);
    });
  }, [API_BASE_URL]);

  // 시군구 불러오기
  useEffect(() => {
    if (!sido) {
      setSigunguOptions([]);
      setDongOptions([]);
      setSigungu("");
      setDong("");
      return;
    }
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/cities`, { params: { province: sido } }).then(res => {
      setSigunguOptions(res.data);
      setSigungu("");
      setDongOptions([]);
      setDong("");
    });
  }, [sido, API_BASE_URL]);

  // 읍면동 불러오기
  useEffect(() => {
    if (!sigungu) {
      setDongOptions([]);
      setDong("");
      return;
    }
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/neighborhoods`, { params: { city: sigungu } }).then(res => {
      // '전체' 항목 추가
      setDongOptions([{ code: "ALL", name: "전체" }, ...res.data]);
      setDong("");
    });
  }, [sigungu, API_BASE_URL]);

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
    // 단지명/면적 필터 초기화
    if (selectedAptName !== null || selectedArea !== null) {
      setSelectedAptName(null);
      setSelectedArea(null);
    }
    if (!sido || !sigungu || !startDate || !endDate) return;
    setLoading(true);
    try {
      const params: { sido: string; sigungu: string; startDate: string; endDate: string; dong?: string; dealType?: string } = {
        sido,
        sigungu,
        startDate,
        endDate,
      };
      if (dong && dong !== "ALL") params.dong = dong;
      params.dealType = dealType;
      const res = await axios.get(`${API_BASE_URL}/api/deals`, { params });
      // 이하 동일 (전체 데이터 기준 정렬/필터)
      const mapped = (res.data as Deal[]).map((item, idx) => ({
        id: item.id || `${sigungu}-1-${idx}`,
        region: item.region || '',
        address: item.address || '',
        area: item.area || 0,
        price: item.price || 0,
        date: item.date || '',
        aptName: String(item.aptNm || item.aptName || ''),
        floor: String(item.floor || ''),
        buildYear: String(item.buildYear || ''),
        dealMonth: String(item.dealMonth || ''),
        dealDay: String(item.dealDay || ''),
        tradeType: String(item.tradeType || item.dealingGbn || item["거래유형"] || item.dealingGbn || ''),
        cdealType: String(item.cdealType || item["계약해제"] || ''),
        deposit: item.deposit !== undefined ? item.deposit : item.price, // 서버에서 deposit 내려오면 사용, 없으면 price(매매)
        monthlyRent: Number(item.monthlyRent !== undefined ? item.monthlyRent : (item.rent !== undefined ? item.rent : 0)),
        contractType: String(item.contractType || item.tradeType || item["임대구분"] || item["rentGbn"] || ''),
      }));
      setDeals(mapped);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

  // 거래금액 한글 억/천 단위 포맷 함수
  function formatKoreanPrice(price: number): string {
    if (isNaN(price) || price === 0) return '-';
    const eok = Math.floor(price / 10000);
    const chun = price % 10000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += `${eok > 0 ? chun.toLocaleString() : chun.toLocaleString()}만원`;
    else if (eok > 0) result += '만원';
    return result;
  }

  // 페이지 변경 함수 (모바일에서 스크롤 포함)
  const changePage = (newPage: number) => {
    setCurrentPage(newPage);
    
    // 모바일에서 거래내역 영역으로 스크롤
    if (dealsSectionRef.current && window.innerWidth < 1024) {
      dealsSectionRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
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
          {/* 필터 & 즐겨찾기 - 스크롤 가능한 사이드바 */}
          <div className="flex flex-col gap-6 w-full lg:w-80 lg:max-w-80 lg:flex-shrink-0">
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
                {/* 지역 선택 */}
                <div className="space-y-3">
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
                
                {/* 거래 구분 선택 */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">거래 구분</label>
                  <RadioGroup value={dealType} onValueChange={value => setDealType(value as "trade" | "rent")} className="flex flex-row gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="trade" id="trade" />
                      <label htmlFor="trade" className="text-sm">매매</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rent" id="rent" />
                      <label htmlFor="rent" className="text-sm">전월세</label>
                    </div>
                  </RadioGroup>
                </div>
                
                {/* 날짜 선택 */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">시작일</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(new Date(startDate), "PPP", { locale: ko }) : "날짜 선택"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate ? new Date(startDate) : undefined}
                          onSelect={(date) => setStartDate(date ? format(date, "yyyy-MM-dd") : "")}
                          initialFocus
                          locale={ko}
                          captionLayout="dropdown"
                          fromYear={2000}
                          toYear={new Date().getFullYear()}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">종료일</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(new Date(endDate), "PPP", { locale: ko }) : "날짜 선택"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate ? new Date(endDate) : undefined}
                          onSelect={(date) => setEndDate(date ? format(date, "yyyy-MM-dd") : "")}
                          initialFocus
                          locale={ko}
                          captionLayout="dropdown"
                          fromYear={2000}
                          toYear={new Date().getFullYear()}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                
                {/* 버튼 */}
                <div className="space-y-2">
                  <Button onClick={fetchDeals} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    🔍 조회
                  </Button>
                  <Button variant="outline" onClick={addFavorite} disabled={!sido || !sigungu || !dong} className="w-full border-yellow-300 text-yellow-700 hover:bg-yellow-50">
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
              <div className="p-4 max-h-64 overflow-y-auto">
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
          <div className="flex-1 flex flex-col gap-4 min-w-0" ref={dealsSectionRef}>
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
              
              {/* 모바일 정렬 버튼 */}
              <div className="lg:hidden p-3 border-b border-gray-200 bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2">정렬</div>
                <div className="flex flex-wrap gap-2">
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
              </div>
              
              {/* 거래내역 테이블 위: 단지명 드롭다운 */}
              {deals.length > 0 && (
                <div className="mb-4 max-w-xs">
                  <Select
                    value={selectedAptName ?? "ALL"}
                    onValueChange={value => {
                      if (value === "ALL") {
                        setSelectedAptName(null);
                        setSelectedArea(null);
                      } else {
                        setSelectedAptName(value);
                        setSelectedArea(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="단지명 선택 (전체)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">전체 보기</SelectItem>
                      {Array.from(new Set(filteredDeals.map(deal => deal.aptName)))
                        .sort((a, b) => a.localeCompare(b, 'ko'))
                        .map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* 거래내역 테이블 영역 */}
              {selectedAptName && (
                <div className="p-3">
                  <Button onClick={() => { setSelectedAptName(null); setSelectedArea(null); }} variant="outline" className="mb-2">
                    전체 보기
                  </Button>
                  <span className="ml-2 text-blue-700 font-semibold">{selectedAptName} 단지의 거래내역 입니다.</span>
                  {/* 전용면적 버튼 */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Array.from(new Set(sortDeals(deals).filter(deal => deal.aptName === selectedAptName).map(deal => deal.area))).map(area => (
                      <Button
                        key={area}
                        size="sm"
                        variant={selectedArea === area ? 'default' : 'outline'}
                        onClick={() => setSelectedArea(area as number)}
                        className="text-xs"
                      >
                        {area}㎡
                      </Button>
                    ))}
                    {selectedArea !== null && (
                      <Button size="sm" variant="ghost" onClick={() => setSelectedArea(null)} className="text-xs">
                        전체 면적
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="p-4">
                {loading ? (
                  <div className="text-center text-gray-500">조회 중...</div>
                ) : deals.length === 0 ? (
                  <div className="text-center text-gray-400">조회 결과가 없습니다.</div>
                ) : (
                  <>
                    {/* 거래내역 테이블 영역 */}
                    {dealType === 'rent' ? (
                      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-[12px]">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-2 py-2 text-left font-semibold">지역</th>
                              <th className="px-2 py-2 text-left font-semibold">단지명</th>
                              <th className="px-2 py-2 text-left font-semibold">층</th>
                              <th className="px-2 py-2 text-left font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('area')}>
                                <div className="flex items-center gap-1">
                                  전용면적
                                  {getSortIcon('area')}
                                </div>
                              </th>
                              <th className="px-2 py-2 text-left font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('deposit')}>
                                <div className="flex items-center gap-1">
                                  보증금
                                  {getSortIcon('deposit')}
                                </div>
                              </th>
                              <th className="px-2 py-2 text-left font-semibold">월세금액</th>
                              <th className="px-2 py-2 text-left font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('date')}>
                                <div className="flex items-center gap-1">
                                  계약일
                                  {getSortIcon('date')}
                                </div>
                              </th>
                              <th className="px-2 py-2 text-left font-semibold">계약유형</th>
                              <th className="px-2 py-2 text-left font-semibold cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => toggleSort('buildYear')}>
                                <div className="flex items-center gap-1">
                                  건축년도
                                  {getSortIcon('buildYear')}
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedDeals.map((deal) => (
                              <tr key={deal.id} className="border-b last:border-b-0">
                                <td className="px-2 py-1 whitespace-nowrap">{deal.region}</td>
                                <td className="px-2 py-1 whitespace-nowrap cursor-pointer text-blue-600 hover:underline" onClick={() => setSelectedAptName(deal.aptName)}>{deal.aptName}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.floor}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.area}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.deposit ? formatKoreanPrice(Number(deal.deposit)) : '-'}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.monthlyRent ? deal.monthlyRent.toLocaleString() + '만원' : '-'}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.date}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.contractType}</td>
                                <td className="px-2 py-1 whitespace-nowrap">{deal.buildYear}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      // ... 기존 매매 테이블 ...
                      <div className="hidden lg:block overflow-x-auto">
                        <div className="max-h-96 overflow-y-auto border rounded-lg">
                          <table className="min-w-full text-[12px] relative">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-gray-100 border-b">
                                <th className="border px-2 py-1 bg-gray-100">지역</th>
                                <th className="border px-2 py-1 bg-gray-100">단지명</th>
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
                                <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('date')}>
                                  <div className="flex items-center justify-between">
                                    계약일
                                    {getSortIcon('date')}
                                  </div>
                                </th>
                                <th className="border px-2 py-1 bg-gray-100">거래유형</th>
                                <th className="border px-2 py-1 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('cdealType')}>
                                  <div className="flex items-center justify-between">
                                    계약해제
                                    {getSortIcon('cdealType')}
                                  </div>
                                </th>
                                <th className="border px-2 py-1 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => toggleSort('buildYear')}>
                                  <div className="flex items-center justify-between">
                                    건축년도
                                    {getSortIcon('buildYear')}
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pagedDeals.map((deal) => (
                                <tr key={deal.id} className="even:bg-gray-50 hover:bg-gray-100 transition-colors">
                                  <td className="border px-2 py-1">{deal.region}</td>
                                  <td className="border px-2 py-1">
                                    <span
                                      onClick={() => { setSelectedAptName(deal.aptName); setSelectedArea(null); }}
                                      className="cursor-pointer text-blue-700 underline hover:text-blue-900"
                                    >
                                      {deal.aptName}
                                    </span>
                                  </td>
                                  <td className="border px-2 py-1">{deal.floor}</td>
                                  <td className="border px-2 py-1">{deal.area}</td>
                                  <td className="border px-2 py-1 font-medium text-blue-600">{formatKoreanPrice(deal.price)}</td>
                                  <td className="border px-2 py-1">{deal.date}</td>
                                  <td className="border px-2 py-1">{deal.tradeType || deal.dealingGbn || deal["거래유형"] || ''}</td>
                                  <td className="border px-2 py-1">{deal.cdealType || deal["계약해제"] || ''}</td>
                                  <td className="border px-2 py-1">{deal.buildYear}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 모바일 세로모드: 카드 형태 */}
                    <div className="lg:hidden space-y-3">
                      {pagedDeals.map((deal) => (
                        <div key={deal.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <div className="space-y-2">
                            {/* 단지명과 가격 */}
                            <div className="flex justify-between items-start">
                              <h3 className="font-semibold text-gray-900 text-sm truncate flex-1 mr-2">
                                <span
                                  onClick={() => { setSelectedAptName(deal.aptName); setSelectedArea(null); }}
                                  className="cursor-pointer text-blue-700 underline hover:text-blue-900"
                                >
                                  {deal.aptName}
                                </span>
                              </h3>
                              <span className="font-bold text-blue-600 text-lg whitespace-nowrap">
                                {formatKoreanPrice(deal.price)}
                              </span>
                            </div>
                            
                            {/* 지역 정보 */}
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">{deal.region}</span>
                            </div>
                            
                            {/* 상세 정보 그리드 */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                              <div className="flex justify-between">
                                <span>층:</span>
                                <span className="font-medium">{deal.floor}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>면적:</span>
                                <span className="font-medium">{deal.area}㎡</span>
                              </div>
                              <div className="flex justify-between">
                                <span>계약일:</span>
                                <span className="font-medium">{deal.date}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>건축년도:</span>
                                <span className="font-medium">{deal.buildYear}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>거래유형:</span>
                                <span className="font-medium">{deal.tradeType || deal.dealingGbn || deal["거래유형"] || '-'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>계약해제:</span>
                                <span className="font-medium">{deal.cdealType || deal["계약해제"] || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 페이지네이션 */}
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

                    {/* 단지명+전용면적 선택 시 가격 추이 라인차트 (거래내역 아래) - 이 부분을 dealType === 'trade' 조건으로 감싼다 */}
                    {/* 매매(거래금액) 차트 */}
                    {dealType === 'trade' && selectedAptName && selectedArea !== null && filteredDeals.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
                        <h3 className="font-semibold text-gray-800 mb-2">가격 추이 (전용면적 {selectedArea}㎡)</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart
                            data={filteredDeals
                              .map(deal => ({
                                date: deal.date,
                                price: deal.price
                              }))
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            }
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => v.toLocaleString()} />
                            <Tooltip formatter={v => v.toLocaleString() + '만원'} labelFormatter={l => `계약일: ${l}`} />
                            <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {/* 전월세(전세 보증금) 차트 */}
                    {dealType === 'rent' && selectedAptName && selectedArea !== null && filteredDeals.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
                        <h3 className="font-semibold text-gray-800 mb-2">전세 보증금 추이</h3>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart
                            data={filteredDeals.filter(d => Number(d.monthlyRent) === 0)
                              .map(deal => ({
                                date: deal.date,
                                deposit: deal.deposit
                              }))
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            }
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => v.toLocaleString()} />
                            <Tooltip formatter={v => v.toLocaleString() + '만원'} labelFormatter={l => `계약일: ${l}`} />
                            <Line type="monotone" dataKey="deposit" stroke="#8884d8" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
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
