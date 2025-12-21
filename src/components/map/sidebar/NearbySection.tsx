'use client';

import { MapPin } from 'lucide-react';
import { NearbyApartment } from './types';

interface NearbySectionProps {
    data: NearbyApartment[];
    currentPricePerPyeong: number;  // 평당가로 변경
}

// 평당가 포맷 (만원 단위)
function formatPricePerPyeong(price: number): string {
    if (!price) return '-';
    return `${price.toLocaleString()}만`;
}

export default function NearbySection({ data, currentPricePerPyeong }: NearbySectionProps) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                주변 비교 데이터가 없습니다
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                주변 시세 비교 <span className="text-xs font-normal text-muted-foreground">(평당가)</span>
            </h4>
            <div className="space-y-1.5">
                {data.map((item, idx) => {
                    const itemPricePerPyeong = item.pricePerPyeong || 0;
                    const diff = currentPricePerPyeong > 0 && itemPricePerPyeong > 0
                        ? ((itemPricePerPyeong - currentPricePerPyeong) / currentPricePerPyeong * 100).toFixed(1)
                        : null;
                    const isHigher = diff && parseFloat(diff) > 0;

                    return (
                        <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-accent/30 rounded-lg"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{item.name}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {item.householdCount?.toLocaleString()}세대
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-semibold text-sm">
                                    {formatPricePerPyeong(itemPricePerPyeong)}/평
                                </div>
                                {diff && (
                                    <div className={`text-[10px] ${isHigher ? 'text-red-500' : 'text-blue-500'}`}>
                                        {isHigher ? '+' : ''}{diff}%
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
