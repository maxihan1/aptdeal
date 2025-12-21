'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Loader2, Key } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RegionChild {
    name: string;
    lat?: number;
    lng?: number;
    apartmentCount?: number;
    avgPrice?: number;
    // 아파트인 경우 추가 필드
    id?: string;
    address?: string;
    householdCount?: number;
    dongCount?: number;
    buildYear?: string;
    avgPrice90d?: number;
    lastDealPrice?: number;
    avgJeonse?: number;
    dealCount30d?: number;
    rentCount?: number;
}

interface RegionData {
    type: 'sigungu' | 'dong' | 'apartments';
    parentName: string;
    children: RegionChild[];
    totalCount: number;
    totalApartments?: number;
}

interface RegionSidebarProps {
    regionType: 'sido' | 'sigungu' | 'dong';
    regionName: string;
    parentName?: string | null;
    isOpen: boolean;
    onClose: () => void;
    onRegionClick?: (child: RegionChild, type: string) => void;
    onApartmentClick?: (apartment: RegionChild) => void;
    bounds?: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } };
    className?: string;
}

// 가격 포맷
function formatPriceShort(price: number): string {
    if (!price) return '-';
    const eok = Math.floor(price / 10000);
    const remainder = Math.round((price % 10000) / 1000);

    if (eok > 0) {
        return remainder > 0 ? `${eok}.${remainder}억` : `${eok}억`;
    }
    return `${Math.round(price / 100) * 100}만`;
}

export default function RegionSidebar({
    regionType,
    regionName,
    parentName,
    isOpen,
    onClose,
    onRegionClick,
    onApartmentClick,
    bounds,
    className
}: RegionSidebarProps) {
    const [data, setData] = useState<RegionData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !regionName) {
            return;
        }

        async function loadChildren() {
            setIsLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams({
                    type: regionType,
                    name: regionName,
                });
                if (parentName) {
                    params.set('parent', parentName);
                }
                // bounds 필터링 제거 - 지도 이동으로 인한 재호출 방지
                // 지역 클릭 시 해당 지역의 모든 하위 지역을 표시

                const response = await fetch(`/api/map/regions/children?${params}`);

                if (!response.ok) {
                    throw new Error('데이터를 불러올 수 없습니다');
                }

                const result = await response.json();
                setData(result);
            } catch (err) {
                console.error('Failed to load region children:', err);
                setError(err instanceof Error ? err.message : '데이터 로드 실패');
            } finally {
                setIsLoading(false);
            }
        }

        loadChildren();
    }, [regionType, regionName, parentName, isOpen]); // bounds 의존성 제거

    // 사이드바가 닫힐 때 데이터 초기화
    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                setData(null);
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const getTitle = () => {
        if (regionType === 'sido') return `${regionName} 시군구`;
        if (regionType === 'sigungu') return `${regionName} 읍면동`;
        return `${regionName} 아파트`;
    };

    return (
        <>
            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div
                className={cn(
                    "fixed left-0 top-0 h-[100dvh] bg-background border-r shadow-xl z-50",
                    "w-[90%] sm:w-[340px] md:w-[380px]",
                    "transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    className
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-primary/10 to-primary/5">
                    <div>
                        <h2 className="font-bold text-base">{getTitle()}</h2>
                        {data && (
                            <p className="text-xs text-muted-foreground">
                                {data.totalCount}개 {data.type === 'apartments' ? '단지' : '지역'}
                                {data.totalApartments && ` · ${data.totalApartments}개 단지`}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* Content - pb-safe for iOS safe area */}
                <div className="h-[calc(100dvh-60px)] overflow-y-auto scrollbar-hide pb-[env(safe-area-inset-bottom)]">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm p-4 text-center">
                            {error}
                        </div>
                    ) : data ? (
                        <div className="p-2">
                            {data.type === 'apartments' ? (
                                // 아파트 목록
                                <div className="space-y-2">
                                    {data.children.map((apt, idx) => (
                                        <div
                                            key={apt.id || idx}
                                            onClick={() => onApartmentClick?.(apt)}
                                            className="p-3 bg-accent/30 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-sm truncate">{apt.name}</h4>
                                                    <p className="text-[10px] text-muted-foreground truncate">{apt.address}</p>
                                                </div>
                                                <div className="text-right ml-2">
                                                    <div className="font-bold text-primary text-sm">
                                                        {formatPriceShort(apt.avgPrice90d || apt.lastDealPrice || 0)}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground">
                                                        {apt.avgPrice90d ? '3개월 평균' : apt.lastDealPrice ? '마지막 거래' : '-'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                                                <div>세대수: <span className="text-foreground font-medium">{apt.householdCount?.toLocaleString() || '-'}세대</span></div>
                                                <div>준공년도: <span className="text-foreground font-medium">{apt.buildYear || '-'}년</span></div>
                                                <div>매매: <span className="text-foreground font-medium">{apt.dealCount30d || 0}건</span></div>
                                                <div>전월세: <span className="text-foreground font-medium">{apt.rentCount || 0}건</span></div>
                                                {(apt.avgJeonse ?? 0) > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <Key className="w-3 h-3" />
                                                        전세 평균: <span className="text-foreground font-medium">{formatPriceShort(apt.avgJeonse ?? 0)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                // 지역 목록 (시군구/읍면동)
                                <div className="space-y-1.5">
                                    {data.children.map((child, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => onRegionClick?.(child, data.type)}
                                            className="flex items-center justify-between p-3 bg-accent/30 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-primary" />
                                                <div>
                                                    <div className="font-medium text-sm">{child.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {child.apartmentCount?.toLocaleString() || 0}개 단지
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-semibold text-sm text-primary">
                                                    {formatPriceShort(child.avgPrice || 0)}
                                                </div>
                                                <div className="text-[9px] text-muted-foreground">평균</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
}
