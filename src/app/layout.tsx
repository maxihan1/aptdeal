"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "../components/Sidebar";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Script from "next/script";
import { GA_TRACKING_ID, pageview } from "@/lib/gtag";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  
  const handleHeaderClick = () => {
    if (isMobile) {
      // 모바일에서 헤더 클릭 시 사이드바만 보여주기
      const params = new URLSearchParams(searchParams.toString());
      params.set("sidebarOnly", "1");
      router.replace(`/?${params.toString()}`);
    } else {
      // 데스크톱에서는 루트 페이지로 이동
      router.push("/");
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 w-full">
      <div className="w-full px-4">
        <div className="flex items-center justify-between h-12 sm:h-16">
          <div 
            onClick={handleHeaderClick}
            className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
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
  );
}

function RootLayoutContent({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 클라이언트에서만 동작하는 모바일 감지
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 현재 경로 확인 (라우팅 변경 감지)
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRegionPage = pathname.startsWith("/region");
  const sidebarOnly = searchParams.get("sidebarOnly") === "1";

  // Google Analytics 페이지뷰 추적
  useEffect(() => {
    if (GA_TRACKING_ID) {
      const url = pathname + searchParams.toString();
      pageview(url);
    }
  }, [pathname, searchParams]);

  return (
    <html lang="en">
      <head>
        {/* 기본 메타 태그 */}
        <title>APTDEAL - 아파트 실거래가 조회 서비스</title>
        <meta name="description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다. 지역별, 아파트별, 면적별 실거래가 정보를 제공합니다." />
        <meta name="keywords" content="아파트 실거래가, 전월세 실거래가, 아파트 트렌드, 아파트 가격 변동, 아파트 가격하락, 아파트 전망, 부동산 전망, 아파트 랭킹, 압구정 현대 아파트, 래미안, 힐스테이트, 푸르지오, 자이, 롯데캐슬, 아파트전세, 더샵, 올림픽파크 포레온, 헬리오시티, 잠실엘스, 잠실리첸츠, 반포자이, 원베일리, 아크로비스타, 아크로리버파크" />
        <meta name="author" content="APTDEAL" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />
        
        {/* 캐노니컬 URL */}
        <link rel="canonical" href="https://aptdeal.kr" />
        
        {/* Open Graph 태그 */}
        <meta property="og:title" content="APTDEAL - 아파트 실거래가 조회 서비스" />
        <meta property="og:description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다." />
        <meta property="og:url" content="https://aptdeal.kr" />
        <meta property="og:site_name" content="APTDEAL" />
        <meta property="og:image" content="https://aptdeal.kr/aptdeallogo.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="APTDEAL 로고" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:type" content="website" />
        
        {/* Twitter 카드 */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="APTDEAL - 아파트 실거래가 조회 서비스" />
        <meta name="twitter:description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다." />
        <meta name="twitter:image" content="https://aptdeal.kr/aptdeallogo.png" />
        
        {/* Google Search Console 소유권 확인 */}
        <meta name="google-site-verification" content={process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'google147b28c0e8d03660'} />
        
        {/* Google Analytics */}
        <Script
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
        />
        <Script
          id="gtag-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_TRACKING_ID}', {
                page_location: window.location.href,
              });
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        <div className="flex flex-col sm:flex-row w-full max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6">
          {sidebarOnly ? (
            <Sidebar />
          ) : (
            <>
              {(!isMobile || !isRegionPage) && <Sidebar />}
              <main className="flex-1 py-2 sm:px-4">{children ?? null}</main>
            </>
          )}
        </div>
      </body>
    </html>
  );
}

export default function RootLayout(props: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense>
      <RootLayoutContent {...props} />
    </Suspense>
  );
}
