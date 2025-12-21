'use client';

import { useRouter } from 'next/navigation';
import { X, MapPin, Home, Calendar, Building2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ApartmentInfo {
    id: string;
    name: string;
    address: string;
    dong?: string;
    gu?: string;
    avgPrice: number; // 만원 단위
    recentPrice?: number; // 최근 거래가
    priceChange?: number; // 전월 대비 변동률 (%)
    householdCount?: number;
    buildYear?: string;
    dongCount?: number;
    lat?: number;
    lng?: number;
}

interface MapInfoCardProps {
    apartment: ApartmentInfo | null;
    onClose: () => void;
    onDetailClick?: (apartment: ApartmentInfo) => void;
    className?: string;
    position?: 'bottom' | 'right' | 'floating';
}

// 가격을 억 단위로 포맷
function formatPrice(price: number): string {
    if (!price) return '-';
    const eok = Math.floor(price / 10000);
    const remainder = Math.round(price % 10000);

    if (eok > 0) {
        return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만원` : `${eok}억`;
    }
    return `${price.toLocaleString()}만원`;
}

// 짧은 가격 포맷
function formatPriceShort(price: number): string {
    if (!price) return '-';
    const eok = Math.floor(price / 10000);
    const remainder = Math.round((price % 10000) / 1000);

    if (eok > 0) {
        return remainder > 0 ? `${eok}.${remainder}억` : `${eok}억`;
    }
    return `${Math.round(price / 100) * 100}만`;
}

export default function MapInfoCard({
    apartment,
    onClose,
    onDetailClick,
    className,
    position = 'bottom'
}: MapInfoCardProps) {
    const router = useRouter();

    if (!apartment) return null;

    const handleDetailClick = () => {
        if (onDetailClick) {
            onDetailClick(apartment);
        } else {
            // 기본 동작: 단지 상세 페이지로 이동
            const params = new URLSearchParams({
                region: apartment.gu || '',
                dong: apartment.dong || '',
                name: apartment.name,
            });
            router.push(`/?${params.toString()}`);
        }
    };

    const positionStyles = {
        bottom: 'fixed bottom-0 left-0 right-0 mx-4 mb-4 md:relative md:mx-0 md:mb-0',
        right: 'absolute right-4 top-1/2 -translate-y-1/2 w-80',
        floating: 'absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md',
    };

    return (
        <div
            className={cn(
                "bg-background/95 backdrop-blur-md border rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-4 duration-300",
                positionStyles[position],
                className
            )}
        >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b">
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">{apartment.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{apartment.address}</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 -mr-1 rounded-full hover:bg-accent transition-colors flex-shrink-0"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Price Section */}
                <div className="flex items-end justify-between">
                    <div>
                        <div className="text-xs text-muted-foreground mb-1">평균 실거래가</div>
                        <div className="text-2xl font-bold text-primary">
                            {formatPriceShort(apartment.avgPrice)}
                        </div>
                    </div>
                    {apartment.priceChange !== undefined && apartment.priceChange !== 0 && (
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium",
                            apartment.priceChange > 0
                                ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                                : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                            {apartment.priceChange > 0 ? '▲' : '▼'}
                            {Math.abs(apartment.priceChange).toFixed(1)}%
                        </div>
                    )}
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-3 gap-3">
                    {apartment.householdCount && (
                        <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                            <Home className="w-4 h-4 text-muted-foreground mb-1" />
                            <span className="text-xs text-muted-foreground">세대수</span>
                            <span className="text-sm font-semibold">{apartment.householdCount.toLocaleString()}</span>
                        </div>
                    )}
                    {apartment.dongCount && (
                        <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                            <Building2 className="w-4 h-4 text-muted-foreground mb-1" />
                            <span className="text-xs text-muted-foreground">동 수</span>
                            <span className="text-sm font-semibold">{apartment.dongCount}개동</span>
                        </div>
                    )}
                    {apartment.buildYear && (
                        <div className="flex flex-col items-center p-2 bg-muted/50 rounded-lg">
                            <Calendar className="w-4 h-4 text-muted-foreground mb-1" />
                            <span className="text-xs text-muted-foreground">준공</span>
                            <span className="text-sm font-semibold">{apartment.buildYear.slice(0, 4)}년</span>
                        </div>
                    )}
                </div>

                {/* Recent Transaction */}
                {apartment.recentPrice && (
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm text-muted-foreground">최근 거래</span>
                        <span className="font-semibold">{formatPrice(apartment.recentPrice)}</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 pt-0">
                <button
                    onClick={handleDetailClick}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                    상세정보 보기
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
