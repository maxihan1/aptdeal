"use client";
import { useEffect, useState, useRef } from "react";

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

export default function Home() {
  // 거래내역 상태 및 페이지네이션, 정렬 등만 남김
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const dealsSectionRef = useRef<HTMLDivElement>(null);

  // 필터링: 단지명+전용면적, 동, 전체
  // filteredDeals 타입 명시
  const filteredDeals: Deal[] = []; // 더미 데이터
  const totalPages = Math.ceil(filteredDeals.length / itemsPerPage);
  // filteredDeals를 useMemo로 감싸고, useEffect deps에서 제외

  // deals가 바뀌면 1페이지로 초기화
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredDeals]); // filteredDeals가 변경될 때만 페이지 초기화

  // 거래금액 한글 억/천 단위 포맷 함수
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
      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex-1 flex flex-col gap-4 min-w-0" ref={dealsSectionRef}>
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
              {/* 모바일 카드형 생략 */}
              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4">
                  <button
                    className="border rounded px-3 py-1 text-xs"
                    onClick={() => changePage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    이전
                  </button>
                  <span className="text-sm text-gray-600">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="border rounded px-3 py-1 text-xs"
                    onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    다음
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
