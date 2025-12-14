"use client";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Star, CalendarIcon, X as XIcon, ArrowLeft } from "lucide-react";
import { trackSearch, trackFavoriteRegion } from "@/lib/gtag";
import axios from "axios";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface RegionOption {
  code: string;
  name: string;
}

import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
  closeMobileMenu?: () => void;
}

const FAVORITE_KEY = "apt_favorites";

export default function Sidebar({ className, closeMobileMenu }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // 로컬스토리지 캐시 키
  const CACHE_KEYS = {
    SIDO_OPTIONS: "apt_sido_options",
    SIGUNGU_OPTIONS: "apt_sigungu_options",
    DONG_OPTIONS: "apt_dong_options",
    FILTER_STATE: "apt_filter_state"
  };

  // 최근 3개월 기본 날짜 설정
  const getDefaultDates = () => {
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    return {
      start: threeMonthsAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    };
  };

  // 지역 옵션 상태 (빈 배열로 시작)
  const [sidoOptions, setSidoOptions] = useState<RegionOption[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<RegionOption[]>([]);
  const [dongOptions, setDongOptions] = useState<RegionOption[]>([]);

  // 필터 상태 (기본값으로 시작)
  const defaultDates = getDefaultDates();
  const [sido, setSido] = useState<string>("");
  const [sigungu, setSigungu] = useState<string>("");
  const [dong, setDong] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
  const [dealType, setDealType] = useState<"trade" | "rent">("trade");
  const [showSigunguAlert, setShowSigunguAlert] = useState(false); // 시군구 선택 안내 모달

  // 마운트 완료 플래그 (hydration 이후에만 localStorage 읽기)
  const [isMounted, setIsMounted] = useState(false);

  // 클라이언트 마운트 후 localStorage에서 캐시 복원
  useEffect(() => {
    setIsMounted(true);
    try {
      // 필터 상태 복원
      const cachedFilter = localStorage.getItem(CACHE_KEYS.FILTER_STATE);
      if (cachedFilter) {
        const state = JSON.parse(cachedFilter);
        if (state.sido) setSido(state.sido);
        if (state.sigungu) setSigungu(state.sigungu);
        if (state.dong) setDong(state.dong);
        if (state.startDate) setStartDate(state.startDate);
        if (state.endDate) setEndDate(state.endDate);
        if (state.dealType) setDealType(state.dealType);
      }
      // 옵션 캐시 복원
      const cachedSido = localStorage.getItem(CACHE_KEYS.SIDO_OPTIONS);
      if (cachedSido) setSidoOptions(JSON.parse(cachedSido));
      const cachedSigungu = localStorage.getItem(CACHE_KEYS.SIGUNGU_OPTIONS);
      if (cachedSigungu) setSigunguOptions(JSON.parse(cachedSigungu));
      const cachedDong = localStorage.getItem(CACHE_KEYS.DONG_OPTIONS);
      if (cachedDong) setDongOptions(JSON.parse(cachedDong));
    } catch (e) {
      console.error('Failed to restore cache:', e);
    }
  }, [CACHE_KEYS.FILTER_STATE, CACHE_KEYS.SIDO_OPTIONS, CACHE_KEYS.SIGUNGU_OPTIONS, CACHE_KEYS.DONG_OPTIONS]);

  // 필터 상태 변경 시 로컬스토리지에 저장 (마운트 후에만)
  useEffect(() => {
    if (!isMounted) return;
    const filterState = { sido, sigungu, dong, startDate, endDate, dealType };
    localStorage.setItem(CACHE_KEYS.FILTER_STATE, JSON.stringify(filterState));
  }, [sido, sigungu, dong, startDate, endDate, dealType, isMounted, CACHE_KEYS.FILTER_STATE]);

  // 즐겨찾기 상태
  const [favorites, setFavorites] = useState<RegionOption[]>([]);
  // 즐겨찾기 선택 예약 (pendingSelect)
  const [pendingSelect, setPendingSelect] = useState<{ sido: string, sigungu: string, dong: string } | null>(null);

  // 달력 팝오버 open 상태 관리
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen] = useState(false);

  // 모달 open 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessages, setModalMessages] = useState<string[]>([]);

  // URL 파라미터 읽기
  const searchParams = useSearchParams();

  // URL 파라미터에서 초기값 동기화
  useEffect(() => {
    const urlSido = searchParams.get('sido');
    const urlSigungu = searchParams.get('sigungu');
    const urlDong = searchParams.get('dong');
    const urlStartDate = searchParams.get('startDate');
    const urlEndDate = searchParams.get('endDate');
    const urlDealType = searchParams.get('dealType');

    if (urlSido && urlSido !== sido) setSido(urlSido);
    if (urlStartDate) setStartDate(urlStartDate);
    if (urlEndDate) setEndDate(urlEndDate);
    if (urlDealType === 'trade' || urlDealType === 'rent') setDealType(urlDealType);

    // sigungu와 dong은 시도 선택 후 options이 로드된 후에 설정되도록 pending 처리
    if (urlSido && urlSigungu) {
      setPendingSelect({
        sido: urlSido,
        sigungu: urlSigungu,
        dong: urlDong || ""
      });
    }
  }, [searchParams]);

  // API 기본 URL
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

  // 시도 불러오기 (캐시 활용)
  useEffect(() => {
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/provinces`).then(res => {
      setSidoOptions(res.data);
      localStorage.setItem(CACHE_KEYS.SIDO_OPTIONS, JSON.stringify(res.data));
    });
  }, [API_BASE_URL, CACHE_KEYS.SIDO_OPTIONS]);

  // 시군구 불러오기 (캐시 활용)
  useEffect(() => {
    if (!sido) {
      setSigunguOptions([]);
      setSigungu("ALL");
      setDong("ALL");
      return;
    }

    // 세종특별자치시는 시군구가 없으므로 "세종시"로 자동 설정
    if (sido === "세종특별자치시") {
      const sejongOption = [{ code: "세종시", name: "세종시" }];
      setSigunguOptions(sejongOption);
      setSigungu("세종시");
      return;
    }

    // 세종 외 시도 변경 시: 시군구/읍면동 초기화
    setSigungu("ALL");
    setDong("ALL");

    // 캐시에서 이미 해당 시도의 시군구 옵션이 있으면 바로 사용
    const cacheKey = `${CACHE_KEYS.SIGUNGU_OPTIONS}_${sido}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const options = JSON.parse(cached);
      setSigunguOptions(options);
      localStorage.setItem(CACHE_KEYS.SIGUNGU_OPTIONS, JSON.stringify(options));
    }

    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/cities`, { params: { province: sido } }).then(res => {
      setSigunguOptions(res.data);
      localStorage.setItem(cacheKey, JSON.stringify(res.data));
      localStorage.setItem(CACHE_KEYS.SIGUNGU_OPTIONS, JSON.stringify(res.data));
    });
  }, [sido, API_BASE_URL, CACHE_KEYS.SIGUNGU_OPTIONS]);

  // 읍면동 불러오기 (캐시 활용)
  useEffect(() => {
    if (!sigungu || !sido || sigungu === "ALL") {
      setDongOptions([]);
      return;
    }

    // 시군구 변경 시 읍면동을 "전체"로 초기화
    setDong("ALL");
    // 캐시에서 이미 해당 시군구의 동 옵션이 있으면 바로 사용
    const cacheKey = `${CACHE_KEYS.DONG_OPTIONS}_${sido}_${sigungu}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const options = JSON.parse(cached);
      setDongOptions(options);
      localStorage.setItem(CACHE_KEYS.DONG_OPTIONS, JSON.stringify(options));
    }

    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/neighborhoods`, { params: { province: sido, city: sigungu } }).then(res => {
      setDongOptions(res.data);
      localStorage.setItem(cacheKey, JSON.stringify(res.data));
      localStorage.setItem(CACHE_KEYS.DONG_OPTIONS, JSON.stringify(res.data));
    });
  }, [sido, sigungu, API_BASE_URL, CACHE_KEYS.DONG_OPTIONS]);

  // 즐겨찾기 불러오기
  useEffect(() => {
    const fav = localStorage.getItem(FAVORITE_KEY);
    if (fav) setFavorites(JSON.parse(fav));
  }, []);

  // 즐겨찾기 추가
  const addFavorite = () => {
    if (!sido || !sigungu) return;
    const regionParts = [
      sidoOptions.find(s => s.code === sido)?.name || sido,
      sigunguOptions.find(s => s.code === sigungu)?.name || sigungu
    ];

    // 동이 선택된 경우에만 추가
    if (dong && dong !== "ALL") {
      regionParts.push(dongOptions.find(d => d.code === dong)?.name || dong);
    }

    const region: RegionOption = {
      code: dong && dong !== "ALL" ? `${sido}-${sigungu}-${dong}` : `${sido}-${sigungu}`,
      name: regionParts.join(" ")
    };

    if (favorites.find(f => f.code === region.code)) return;
    const next = [...favorites, region];
    setFavorites(next);
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));

    // Google Analytics 추적
    trackFavoriteRegion(region.name);
  };

  // 즐겨찾기 삭제
  const removeFavorite = (code: string) => {
    const next = favorites.filter(f => f.code !== code);
    setFavorites(next);
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  };

  // 조회 버튼 클릭 시 URL 이동
  const handleSearch = () => {
    const messages: string[] = [];
    if (!sido) {
      messages.push("시도를 선택해 주세요.");
    }
    if (!sigungu || sigungu === "ALL") {
      messages.push("시군구를 선택해 주세요.");
    }
    if (!startDate || !endDate) {
      messages.push("시작일과 종료일을 모두 선택해 주세요.");
    }
    if (messages.length > 0) {
      setModalMessages(messages);
      setModalOpen(true);
      return;
    }

    // Google Analytics 추적
    trackSearch(sido, sigungu, dong !== "ALL" ? dong : undefined);

    // 시맨틱 URL 구조 사용: /region/시도/시군구?d=동&t=거래유형
    // 날짜는 로컬스토리지에서 관리 (URL에서 제거)
    const encodedSido = encodeURIComponent(sido);
    const encodedSigungu = encodeURIComponent(sigungu);

    let url = `/region/${encodedSido}/${encodedSigungu}`;
    const params = new URLSearchParams();
    if (dong && dong !== "ALL") params.set('d', dong);
    params.set('t', dealType);

    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;

    router.push(url);
  };

  // 즐겨찾기에서 선택 버튼 클릭 시 예약
  const handleFavoriteSelect = (favCode: string) => {
    const [sidoCode, sigunguCode, dongCode] = favCode.split("-");
    console.log('[Favorite Select]', { favCode, sidoCode, sigunguCode, dongCode });
    setPendingSelect({
      sido: sidoCode,
      sigungu: sigunguCode,
      dong: dongCode || "" // dongCode가 undefined인 경우 빈 문자열로 처리
    });
  };

  // 시도 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && sidoOptions.length > 0) {
      if (sido !== pendingSelect.sido) setSido(pendingSelect.sido);
    }
  }, [pendingSelect, sidoOptions, sido]);

  // 시군구 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && sigunguOptions.length > 0 && sido === pendingSelect.sido) {
      console.log('[Sigungu Auto-Select]', { pendingSelect, sigunguOptions: sigunguOptions.map(o => o.code), sido, sigungu });
      // 옵션에 해당 시군구가 있는지 확인 (code 또는 name으로 매칭)
      const found = sigunguOptions.find(opt => opt.code === pendingSelect.sigungu || opt.name === pendingSelect.sigungu);
      console.log('[Sigungu Found]', found);
      if (found && sigungu !== found.code) {
        // name으로 저장된 경우에도 code로 설정해야 Select가 인식함
        setSigungu(found.code);
      }
    }
  }, [pendingSelect, sigunguOptions, sido, sigungu]);

  // 읍면동 옵션 준비 시 자동 선택
  useEffect(() => {
    if (pendingSelect && sigungu === pendingSelect.sigungu) {
      // 동이 지정되지 않은 즐겨찾기인 경우 (시도-시군만 있는 경우)
      if (!pendingSelect.dong || pendingSelect.dong === "") {
        // 동 선택 없이 완료 처리
        setPendingSelect(null);
        return;
      }

      // 동이 지정된 경우 기존 로직 수행
      if (dongOptions.length > 0) {
        if (dong !== pendingSelect.dong) setDong(pendingSelect.dong);
        // 모두 선택 완료 후 예약 해제
        if (dongOptions.find(d => d.code === pendingSelect.dong)) {
          setPendingSelect(null);
        }
      }
    }
  }, [pendingSelect, dongOptions, sigungu, dong]);

  useEffect(() => {
    if (
      pathname === "/" &&
      (!startDate || !endDate)
    ) {
      const today = new Date();
      const sevenDaysAgo = subDays(today, 7);
      setStartDate(format(sevenDaysAgo, "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    }
  }, [pathname, startDate, endDate]);



  return (
    <aside className={cn(
      "flex flex-col h-full bg-background",
      className
    )}>
      {/* Branded Header Area - Fixed at top */}
      <div className="p-3 pb-2 flex-shrink-0">
        <div className="bg-gradient-to-br from-primary/90 to-blue-600 dark:from-primary/80 dark:to-blue-700 rounded-xl p-4 shadow-lg relative">
          {/* Mobile Close Button */}
          {closeMobileMenu && (
            <button
              onClick={closeMobileMenu}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              aria-label="메뉴 닫기"
            >
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
          )}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <span className="text-white font-extrabold text-lg">A</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg tracking-tight">APTDEAL</h1>
              <p className="text-white/70 text-[11px] font-medium">전국 아파트 실거래가</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-[11px]">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            실시간 데이터 업데이트
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-3 pb-24 space-y-3">
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="text-base">🔍</span>
            <h2 className="text-sm font-semibold text-foreground">검색 조건</h2>
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
              <Select value={sigungu} onValueChange={setSigungu}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="시군 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체</SelectItem>
                  {sigunguOptions.map(opt => (
                    <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dong} onValueChange={setDong}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="읍면동 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체</SelectItem>
                  {dongOptions.map(opt => (
                    <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 거래유형 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">거래유형</label>
              <div className="flex gap-2">
                <Button variant={dealType === "trade" ? "default" : "outline"} onClick={() => setDealType("trade")}>매매</Button>
                <Button variant={dealType === "rent" ? "default" : "outline"} onClick={() => setDealType("rent")}>전월세</Button>
              </div>
            </div>

            {/* 날짜 선택 */}
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">시작일</label>
                <Popover open={startCalOpen} onOpenChange={(open) => setStartCalOpen(open)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => setStartCalOpen(true)}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(new Date(startDate), "PPP", { locale: ko }) : "날짜 선택"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={(date) => {
                        setStartDate(date ? format(date, "yyyy-MM-dd") : "");
                        if (date) setStartCalOpen(false);
                      }}
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
                <label className="text-sm font-medium text-foreground">종료일</label>
                <Popover open={endCalOpen} onOpenChange={(open) => setEndCalOpen(open)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => setEndCalOpen(true)}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(new Date(endDate), "PPP", { locale: ko }) : "날짜 선택"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate) : undefined}
                      onSelect={(date) => {
                        setEndDate(date ? format(date, "yyyy-MM-dd") : "");
                        if (date) setEndCalOpen(false);
                      }}
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
              <Button
                onClick={handleSearch}
                className="w-full"
              >
                🔍 조회
              </Button>
              <Button variant="outline" onClick={addFavorite} disabled={!sido || !sigungu} className="w-full">
                <Star className="w-4 h-4 mr-1" /> 즐겨찾기
              </Button>
            </div>
          </div>
        </div>
        {/* 즐겨찾기 영역 */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="text-base">⭐</span>
            <h2 className="text-sm font-semibold text-foreground">관심지역</h2>
          </div>
          <div className="p-4">
            {favorites.length === 0 ? (
              <div className="text-muted-foreground text-sm text-center py-4">등록된 관심지역이 없습니다.</div>
            ) : (
              <ul className="space-y-2">
                {favorites.map(fav => (
                  <li
                    key={fav.code}
                    className="relative flex flex-col text-sm gap-1 p-3 bg-muted/30 rounded-lg border border-border cursor-pointer hover:bg-muted hover:border-primary/50 transition-all"
                    onClick={() => handleFavoriteSelect(fav.code)}
                  >
                    <button
                      type="button"
                      aria-label="즐겨찾기 삭제"
                      className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); removeFavorite(fav.code); }}
                    >
                      <XIcon className="w-4 h-4 text-destructive" />
                    </button>
                    <span className="font-medium text-foreground break-words whitespace-normal mb-1 pr-6">{fav.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div> {/* Close px-4 pb-4 wrapper */}
      {/* 안내 모달 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>입력값을 확인해 주세요</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {modalMessages.map((msg, idx) => (
              <div key={idx} className="text-base text-center text-destructive">{msg}</div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button>확인</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
} 