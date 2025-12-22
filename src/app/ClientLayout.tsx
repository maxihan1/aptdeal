"use client";

import Sidebar from "../components/Sidebar";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense, useCallback } from "react";
import { pageview } from "@/lib/gtag";
import { ThemeProvider } from "@/components/theme-provider";
import ViewModeToggle, { ViewMode } from "@/components/ViewModeToggle";
import { KakaoMapProvider } from "@/components/KakaoMapProvider";

import { Menu, List } from "lucide-react";

interface HeaderProps {
  onMenuClick: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showViewModeToggle?: boolean;
}

function Header({ onMenuClick, viewMode, onViewModeChange, showViewModeToggle = true }: HeaderProps) {
  const router = useRouter();
  const isMapMode = viewMode === 'map';

  const handleHeaderClick = () => {
    // 로고 클릭시 항상 홈으로
    router.push("/");
  };

  return (
    <header className="bg-background/95 backdrop-blur-md shadow-sm border-b border-border w-full sticky top-0 z-50 transition-colors duration-300">
      <div className="w-full px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button - 맵 모드에서는 숨김 */}
            {!isMapMode && (
              <button
                onClick={onMenuClick}
                className="lg:hidden p-2 -ml-2 rounded-md hover:bg-accent text-foreground focus:outline-none"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}

            <div
              onClick={handleHeaderClick}
              className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                <span className="text-primary-foreground font-extrabold text-sm sm:text-base">A</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 dark:to-blue-400 tracking-tight">
                APTDEAL
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* View Mode Toggle */}
            {showViewModeToggle && (
              <ViewModeToggle
                mode={viewMode}
                onChange={onViewModeChange}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function ClientLayoutContent({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 클라이언트에서만 동작하는 모바일 감지
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // View Mode 상태 (URL에서 읽기) - 기본값: map
  const viewMode = (searchParams.get('view') as ViewMode) || 'map';

  // View Mode 변경 핸들러
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    if (mode === 'list') {
      // 리스트 모드로 전환 시 홈페이지로 이동
      router.push('/?view=list');
    } else {
      // 지도 모드로 전환 시 view 파라미터 제거 (기본값이 map이므로)
      router.push('/', { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname, searchParams]);

  // Google Analytics 페이지뷰 추적
  useEffect(() => {
    const url = pathname + searchParams.toString();
    pageview(url);
  }, [pathname, searchParams]);

  const isRegionPage = pathname.startsWith("/region");
  const isAptPage = pathname.startsWith("/apt");
  const sidebarOnly = searchParams.get("sidebarOnly") === "1";
  const isHomePage = pathname === "/";

  // 리스트/맵 토글 표시: 홈, 지역 페이지, 단지 상세 페이지에서 표시 (sidebarOnly 제외)
  const showViewModeToggle = (isHomePage || isRegionPage || isAptPage) && !sidebarOnly;

  // 지도 모드: 전체 화면 레이아웃 (모바일 친화적 헤더)
  if (viewMode === 'map' && isHomePage) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-background flex flex-col">
        {/* 지도 모드 헤더 */}
        <header className="flex-shrink-0 h-12 sm:h-14 bg-zinc-900/95 backdrop-blur-md border-b border-zinc-700/50 flex items-center justify-between px-3 sm:px-4 z-50">
          {/* 왼쪽: 로고 */}
          <div
            onClick={() => handleViewModeChange('list')}
            className="flex items-center space-x-2 cursor-pointer"
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-extrabold text-sm">A</span>
            </div>
            <span className="hidden sm:inline text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">
              APTDEAL
            </span>
          </div>

          {/* 가운데: 현재 지역 (지도에서 전달받을 예정) */}
          <div className="flex-1 text-center px-2">
            <span className="text-xs sm:text-sm text-zinc-400 truncate block" id="map-current-region">
              전국 아파트 지도
            </span>
          </div>

          {/* 오른쪽: 시장분석 버튼 */}
          <button
            onClick={() => handleViewModeChange('list')}
            className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 bg-zinc-800/80 rounded-lg border border-zinc-700/50 hover:bg-zinc-700/80 transition-colors text-xs sm:text-sm font-medium text-zinc-200"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">시장분석</span>
          </button>
        </header>

        {/* 전체 화면 컨텐츠 (지도) */}
        <main className="flex-1 w-full overflow-hidden">
          {children ?? null}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      <Header
        onMenuClick={() => setIsMobileMenuOpen(true)}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        showViewModeToggle={showViewModeToggle}
      />

      <div className="flex flex-1 overflow-hidden w-full max-w-screen-2xl mx-auto px-0 sm:px-4 lg:px-6 py-2 sm:py-4 gap-4 relative">
        {/* Desktop Sidebar */}
        {!sidebarOnly && (
          <Sidebar className="hidden lg:block w-64 flex-shrink-0 h-screen overflow-y-auto rounded-lg border border-border bg-card shadow-sm" />
        )}

        {/* Mobile Sidebar Overlay */}
        {isMobile && isMobileMenuOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] bg-background shadow-2xl transition-transform animate-in slide-in-from-left duration-300 flex flex-col overflow-hidden">
              {/* Sidebar Content */}
              <Sidebar className="w-full h-full" closeMobileMenu={() => setIsMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Sidebar Only Mode */}
        {sidebarOnly ? (
          <Sidebar className="w-full h-full" />
        ) : (
          <main className="flex-1 h-full overflow-y-auto rounded-lg border border-border bg-card shadow-sm relative transition-colors duration-300">
            {children ?? null}
          </main>
        )}
      </div>
    </div>
  );
}

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense>
      <ThemeProvider
        attribute="class"
        forcedTheme="dark"
        disableTransitionOnChange
      >
        <KakaoMapProvider>
          <ClientLayoutContent>
            {children}
          </ClientLayoutContent>
        </KakaoMapProvider>
      </ThemeProvider>
    </Suspense>
  );
}