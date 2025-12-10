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
import { useRouter, usePathname } from "next/navigation";
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
}

const FAVORITE_KEY = "apt_favorites";

export default function Sidebar({ className }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  // 지역 옵션 상태
  const [sidoOptions, setSidoOptions] = useState<RegionOption[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<RegionOption[]>([]);
  const [dongOptions, setDongOptions] = useState<RegionOption[]>([]);

  // 필터 상태
  const [sido, setSido] = useState<string>("");
  const [sigungu, setSigungu] = useState<string>("");
  const [dong, setDong] = useState<string>("");
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

  const [startDate, setStartDate] = useState<string>(getDefaultDates().start);
  const [endDate, setEndDate] = useState<string>(getDefaultDates().end);
  const [dealType, setDealType] = useState<"trade" | "rent">("trade");

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





  // API 기본 URL
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

  // 시도 불러오기
  useEffect(() => {
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/provinces`).then(res => {
      setSidoOptions(res.data);
    });
  }, [API_BASE_URL, setSidoOptions]);

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
  }, [sido, API_BASE_URL, setSigunguOptions, setDongOptions]);

  // 읍면동 불러오기
  useEffect(() => {
    if (!sigungu || !sido) {
      setDongOptions([]);
      setDong("");
      return;
    }
    axios.get<RegionOption[]>(`${API_BASE_URL}/api/regions/neighborhoods`, { params: { province: sido, city: sigungu } }).then(res => {
      setDongOptions(res.data);
      setDong("");
    });
  }, [sido, sigungu, API_BASE_URL, setDongOptions]);

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
    if (!sido || !sigungu) {
      messages.push("시도와 시군구를 모두 선택해 주세요.");
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

    const searchParams = new URLSearchParams();
    searchParams.set('sido', sido);
    searchParams.set('sigungu', sigungu);
    if (dong && dong !== "ALL") searchParams.set('dong', dong);
    searchParams.set('startDate', startDate);
    searchParams.set('endDate', endDate);
    searchParams.set('dealType', dealType);
    searchParams.set('loading', 'true'); // 로딩 상태를 URL 파라미터로 전달
    router.push(`/region/?${searchParams.toString()}`);
  };

  // 즐겨찾기에서 선택 버튼 클릭 시 예약
  const handleFavoriteSelect = (favCode: string) => {
    const [sidoCode, sigunguCode, dongCode] = favCode.split("-");
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
      if (sigungu !== pendingSelect.sigungu) setSigungu(pendingSelect.sigungu);
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
      "mt-2 sm:mt-0 sm:static sm:w-72 border-r flex flex-col h-screen overflow-y-auto bg-background border-border",
      className
    )}>
      {/* Branded Header Area */}
      <div className="p-4 pb-3">
        <div className="bg-gradient-to-br from-primary/90 to-blue-600 dark:from-primary/80 dark:to-blue-700 rounded-2xl p-5 shadow-lg mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <span className="text-white font-extrabold text-xl">A</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">APTDEAL</h1>
              <p className="text-white/70 text-xs font-medium">전국 아파트 실거래가</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            실시간 데이터 업데이트
          </div>
        </div>
      </div>

      {/* 검색 필터 영역 */}
      <div className="px-4 pb-4 flex-1 flex flex-col gap-4 overflow-y-auto">
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
          <div className="p-4 max-h-64 overflow-y-auto">
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