'use client';

import { Key } from 'lucide-react';
import { RentInfo } from './types';

interface RentSectionProps {
    data: RentInfo[];
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

export default function RentSection({ data }: RentSectionProps) {
    if (!data || data.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                최근 전월세 데이터가 없습니다
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                최근 전월세
            </h4>
            <div className="space-y-1.5">
                {data.map((item, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-accent/30 rounded-lg"
                    >
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.type === '전세'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                    }`}>
                                    {item.type}
                                </span>
                                <span className="font-medium text-sm">
                                    {formatPrice(item.deposit)}
                                    {item.monthlyRent > 0 && ` / ${item.monthlyRent}만`}
                                </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                {item.area}㎡ · {item.floor}층
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
