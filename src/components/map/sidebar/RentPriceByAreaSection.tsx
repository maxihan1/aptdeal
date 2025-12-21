'use client';

import { Key } from 'lucide-react';

interface RentPriceByAreaItem {
    area: string;      // "59㎡", "84㎡" 등
    avgDeposit: number;
    count: number;
}

interface RentPriceByAreaSectionProps {
    data: RentPriceByAreaItem[];
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

// 면적에서 평수 계산
function areaToPyeong(area: string): string {
    const areaNum = parseInt(area.replace('㎡', ''));
    if (isNaN(areaNum)) return '';
    return `${Math.round(areaNum / 3.3)}평`;
}

export default function RentPriceByAreaSection({ data }: RentPriceByAreaSectionProps) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                전세 면적별 데이터가 없습니다
            </div>
        );
    }

    // 면적 오름차순 정렬
    const sortedData = [...data].sort((a, b) => {
        const aNum = parseInt(a.area) || 0;
        const bNum = parseInt(b.area) || 0;
        return aNum - bNum;
    });

    return (
        <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                전세 면적별 평균 <span className="text-xs font-normal text-muted-foreground">(최근 1년)</span>
            </h4>
            <div className="space-y-1.5">
                {sortedData.map((item, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-accent/30 rounded-lg"
                    >
                        <div>
                            <div className="font-medium text-sm">
                                {item.area} <span className="text-muted-foreground text-xs">({areaToPyeong(item.area)})</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {item.count}건 거래
                            </div>
                        </div>
                        <div className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                            {formatPriceShort(item.avgDeposit)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
