"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "../components/Sidebar";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 w-full">
      <div className="w-full px-4">
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
  );
}

export default function RootLayout({
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
  const isRegionPage = pathname.startsWith("/region");

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        <div className="flex flex-col sm:flex-row w-full max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6">
          {(!isMobile || !isRegionPage) && <Sidebar />}
          <main className="flex-1 py-2 sm:py-4">{children ?? null}</main>
        </div>
      </body>
    </html>
  );
}
