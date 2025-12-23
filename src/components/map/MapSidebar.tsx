'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MapPin, Loader2, ExternalLink, Home, Key, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    BasicInfoSection,
    PriceByAreaSection,
    RentPriceByAreaSection,
    RecentDealsSection,
    RentSection,
    PriceTrendSection,
    NearbySection,
    SchoolSection,
    SidebarData,
} from './sidebar';

type TabType = 'sales' | 'rent';

interface ApartmentBasic {
    id: string;
    name: string;
    displayName?: string;
    address: string;
    dong?: string;
    gu?: string;
    sido?: string;
    avgPrice?: number;
    householdCount?: number;
    isRental?: boolean;
}

interface RegionNavigation {
    type: 'sido' | 'sigungu' | 'dong';
    name: string;
    lat?: number;
    lng?: number;
}

interface MapSidebarProps {
    apartment: ApartmentBasic | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigateToRegion?: (region: RegionNavigation) => void;
    transactionType?: 'sale' | 'rent';
    className?: string;
}

export default function MapSidebar({
    apartment,
    isOpen,
    onClose,
    onNavigateToRegion,
    transactionType = 'sale',
    className
}: MapSidebarProps) {
    const [data, setData] = useState<SidebarData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>(transactionType === 'rent' ? 'rent' : 'sales');
    const prevApartmentId = useRef<string | null>(null);

    // transactionType 필터 변경 시 탭 동기화
    useEffect(() => {
        setActiveTab(transactionType === 'rent' ? 'rent' : 'sales');
    }, [transactionType]);

    // 아파트 선택 시 상세 정보 로드
    useEffect(() => {
        if (!isOpen || !apartment) {
            return;
        }

        // 같은 아파트면 다시 로드하지 않음
        if (prevApartmentId.current === apartment.id && data) {
            return;
        }

        prevApartmentId.current = apartment.id;

        async function loadDetails() {
            if (!apartment) return;

            setIsLoading(true);
            setError(null);

            try {
                // kaptCode 형식인지 확인 (A로 시작하고 숫자)
                const isKaptCode = /^A\d{8}/.test(apartment.id);

                let url: string;
                if (isKaptCode) {
                    url = `/api/apartments/${apartment.id}/sidebar`;
                } else {
                    // kaptCode가 아니면 dong과 name으로 조회
                    const params = new URLSearchParams({
                        name: apartment.name || apartment.id,
                        dong: apartment.dong || '',
                        gu: apartment.gu || '',
                    });
                    url = `/api/apartments/sidebar?${params}`;
                }

                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error('데이터를 불러올 수 없습니다');
                }

                const sidebarData = await response.json();
                setData(sidebarData);
            } catch (err) {
                console.error('Failed to load apartment details:', err);
                setError(err instanceof Error ? err.message : '데이터 로드 실패');
            } finally {
                setIsLoading(false);
            }
        }

        loadDetails();
    }, [apartment?.id, isOpen]);

    // 사이드바가 완전히 닫힌 후 상태 초기화
    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                setData(null);
                prevApartmentId.current = null;
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleDetailClick = () => {
        if (!data?.basic) return;

        // 주소에서 동 이름 추출
        const address = data.basic.address || '';
        const dongMatch = address.match(/(\S+동)\s/);
        const dong = dongMatch ? dongMatch[1] : apartment?.dong || '';

        // 주소에서 시도/시군구 추출
        const addressParts = address.split(' ');
        const sido = addressParts[0] || '';
        const sigungu = addressParts[1] || apartment?.gu || '';

        const params = new URLSearchParams({
            s: sido,
            g: sigungu,
            d: dong,
            r: `${sido} ${sigungu} ${dong}`.trim(),
            t: 'trade',
            n: apartment?.displayName || data.basic.name, // 디스플레이 네임 전달
        });

        // kaptCode가 있으면 추가
        if (data.basic.id) {
            params.set('k', data.basic.id);
        }

        window.location.href = `/apt/${encodeURIComponent(apartment?.name || data.basic.name)}?${params.toString()}`;
    };

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-10 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar - Glassmorphism style, positioned below filter bar */}
            <div
                className={cn(
                    "fixed left-0 top-[100px] h-[calc(100dvh-100px)] z-20",
                    "bg-zinc-900/85 backdrop-blur-xl border-r border-zinc-700/50 shadow-2xl",
                    "w-[90%] sm:w-[340px] md:w-[380px]",
                    "transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    className
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-zinc-700/50 bg-zinc-800/50">
                    <h2 className="font-bold text-base">단지 정보</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* Content - height = viewport - top offset(100px) - header(~48px) */}
                <div className="h-[calc(100dvh-148px)] overflow-y-auto scrollbar-hide pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm p-4 text-center">
                            {error}
                        </div>
                    ) : data ? (
                        <div className="p-3 space-y-4">
                            {/* 브레드크럼 네비게이션 */}
                            {data.basic.address && (
                                <div className="flex items-center gap-1 text-xs flex-wrap">
                                    <MapPin className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                                    {(() => {
                                        // 주소에서 시도, 시군구, 읍면동 파싱
                                        const parts = data.basic.address.split(' ');
                                        const sido = parts[0]; // 서울특별시
                                        const sigungu = parts[1]; // 양천구
                                        const dong = parts[2]; // 목동

                                        return (
                                            <>
                                                {sido && (
                                                    <button
                                                        onClick={() => onNavigateToRegion?.({ type: 'sido', name: sido })}
                                                        className="text-primary hover:underline cursor-pointer"
                                                    >
                                                        {sido}
                                                    </button>
                                                )}
                                                {sigungu && (
                                                    <>
                                                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                                        <button
                                                            onClick={() => onNavigateToRegion?.({ type: 'sigungu', name: sigungu })}
                                                            className="text-primary hover:underline cursor-pointer"
                                                        >
                                                            {sigungu}
                                                        </button>
                                                    </>
                                                )}
                                                {dong && (
                                                    <>
                                                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                                        <button
                                                            onClick={() => onNavigateToRegion?.({ type: 'dong', name: dong })}
                                                            className="text-primary hover:underline cursor-pointer"
                                                        >
                                                            {dong}
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* 단지 이름 */}
                            <div>
                                <h3 className="font-bold text-lg">{apartment?.displayName || data.basic.name}</h3>
                            </div>

                            {/* 기본 정보 섹션 */}
                            <BasicInfoSection basic={data.basic} price={data.price} />

                            {/* 탭 버튼 */}
                            <div className="flex bg-accent/50 rounded-lg p-1">
                                <button
                                    onClick={() => setActiveTab('sales')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all",
                                        activeTab === 'sales'
                                            ? "bg-background shadow-sm text-primary"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Home className="w-3.5 h-3.5" />
                                    매매
                                </button>
                                <button
                                    onClick={() => setActiveTab('rent')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all",
                                        activeTab === 'rent'
                                            ? "bg-background shadow-sm text-primary"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Key className="w-3.5 h-3.5" />
                                    전월세
                                </button>
                            </div>

                            {/* 매매 탭 콘텐츠 */}
                            {activeTab === 'sales' && (
                                <div className="space-y-4">
                                    {/* 매매 면적별 평균가 */}
                                    <PriceByAreaSection data={data.priceByArea} />

                                    {/* 매매 가격 추이 차트 */}
                                    <PriceTrendSection
                                        priceTrend={data.priceTrend}
                                        rentTrend={[]}
                                        showRent={false}
                                    />

                                    {/* 최근 매매 */}
                                    <RecentDealsSection data={data.recentDeals || []} />
                                </div>
                            )}

                            {/* 전월세 탭 콘텐츠 */}
                            {activeTab === 'rent' && (
                                <div className="space-y-4">
                                    {/* 전세 면적별 평균가 */}
                                    <RentPriceByAreaSection data={data.rentPriceByArea || []} />

                                    {/* 전세 가격 추이 차트 */}
                                    <PriceTrendSection
                                        priceTrend={[]}
                                        rentTrend={data.rentTrend}
                                        showSales={false}
                                    />

                                    {/* 최근 전월세 */}
                                    <RentSection data={data.recentRents} />
                                </div>
                            )}

                            {/* 주변 시세 비교 (평당가 기준) - 공통 */}
                            <NearbySection
                                data={data.nearby}
                                currentPricePerPyeong={data.price?.pricePerPyeong}
                            />

                            {/* 학군 정보 - 공통 */}
                            <SchoolSection data={data.school} />

                            {/* 상세 페이지 링크 */}
                            <button
                                onClick={handleDetailClick}
                                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                            >
                                상세 정보 보기
                                <ExternalLink className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                            아파트를 선택해주세요
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
