import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "../components/Sidebar";
import ClientLayout from "./ClientLayout";
import Script from "next/script";
import { GA_TRACKING_ID } from "@/lib/gtag";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 사이트 제목 */}
        <title>APTDEAL - 아파트 실거래가 조회 서비스</title>
        {/* 사이트 설명 */}
        <meta name="description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다. 지역별, 아파트별, 면적별 실거래가 정보를 제공합니다." />
        
        {/* 기본 메타 태그 */}
        <meta name="keywords" content="아파트 실거래가, 전월세 실거래가, 아파트 트렌드, 아파트 가격 변동, 아파트 가격하락, 아파트 전망, 부동산 전망, 아파트 랭킹, 압구정 현대 아파트, 래미안, 힐스테이트, 푸르지오, 자이, 롯데캐슬, 아파트전세, 더샵, 올림픽파크 포레온, 헬리오시티, 잠실엘스, 잠실리첸츠, 반포자이, 원베일리, 아크로비스타, 아크로리버파크" />
        <meta name="author" content="APTDEAL" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />
        
        {/* 캐노니컬 URL */}
        <link rel="canonical" href="https://aptdeal.kr" />
        
        {/* Open Graph 태그 */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="APTDEAL - 아파트 실거래가 조회 서비스" />
        <meta property="og:description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다." />
        <meta property="og:url" content="https://aptdeal.kr" />
        <meta property="og:site_name" content="APTDEAL" />
        <meta property="og:image" content="https://aptdeal.kr/aptdeallogo.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="APTDEAL 로고" />
        <meta property="og:locale" content="ko_KR" />
        
        {/* Twitter 카드 */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="APTDEAL - 아파트 실거래가 조회 서비스" />
        <meta name="twitter:description" content="전국 아파트 실거래가를 쉽고 빠르게 조회할 수 있는 서비스입니다." />
        <meta name="twitter:image" content="https://aptdeal.kr/aptdeallogo.png" />
        
        {/* Google Search Console 소유권 확인 */}
        <meta name="google-site-verification" content={process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'google147b28c0e8d03660'} />
        
        {/* 네이버 서치어드바이저 소유권 확인 */}
        <meta name="naver-site-verification" content="naver1458ee2edb2c4a3a65c28b9d8ed873be" />
        
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
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
