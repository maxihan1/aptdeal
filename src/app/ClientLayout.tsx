"use client";

import Sidebar from "../components/Sidebar";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { pageview } from "@/lib/gtag";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";

import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  const handleHeaderClick = () => {
    // 로고 클릭시 항상 홈으로
    router.push("/");
  };

  return (
    <header className="bg-background/95 backdrop-blur-md shadow-sm border-b border-border w-full sticky top-0 z-50 transition-colors duration-300">
      <div className="w-full px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 -ml-2 rounded-md hover:bg-accent text-foreground focus:outline-none"
            >
              <Menu className="h-6 w-6" />
            </button>

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
            <div className="hidden md:block text-sm text-muted-foreground font-medium mr-2">
              전국 아파트 실거래가 조회
            </div>
            <ModeToggle />
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
  const sidebarOnly = searchParams.get("sidebarOnly") === "1";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      <Header onMenuClick={() => setIsMobileMenuOpen(true)} />

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

        {/* Sidebar Only Mode (Legacy support if needed, but mainly we use Overlay now) */}
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
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ClientLayoutContent>
          {children}
        </ClientLayoutContent>
      </ThemeProvider>
    </Suspense>
  );
}