'use client';

import { Home } from 'lucide-react';

interface RecentDeal {
    price: number;
    area: number;
    floor: number;
    date: string;
}

interface RecentDealsSectionProps {
    data: RecentDeal[];
}

// 가격 포맷
function formatPrice(price: number): string {
    if (!price) return '-';
    const eok = Math.floor(price / 10000);
    const remainder = Math.round((price % 10000) / 1000) * 1000;

    if (eok > 0) {
        return remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만` : `${eok}억`;
    }
    return `${price.toLocaleString()}만`;
}

// 면적에서 평수 계산
function areaToPyeong(area: number): string {
    return `${Math.round(area / 3.3)}평`;
}

export default function RecentDealsSection({ data }: RecentDealsSectionProps) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                최근 매매 데이터가 없습니다
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" />
                최근 매매
            </h4>
            <div className="space-y-1.5">
                {data.map((item, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-accent/30 rounded-lg"
                    >
                        <div>
                            <div className="font-semibold text-sm text-primary">
                                {formatPrice(item.price)}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                {item.area}㎡ ({areaToPyeong(item.area)}) · {item.floor}층
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {item.date}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
