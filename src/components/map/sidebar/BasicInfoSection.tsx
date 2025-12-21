'use client';

import { Home, Calendar, Building2, Car, Layers, TrendingUp } from 'lucide-react';
import { BasicInfo, PriceInfo } from './types';

interface BasicInfoSectionProps {
    basic: BasicInfo;
    price: PriceInfo;
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

export default function BasicInfoSection({ basic, price }: BasicInfoSectionProps) {
    const infoItems = [
        { icon: Home, label: '세대수', value: basic.householdCount ? `${basic.householdCount.toLocaleString()}세대` : null },
        { icon: Building2, label: '동 수', value: basic.dongCount ? `${basic.dongCount}개동` : null },
        { icon: Calendar, label: '준공', value: basic.buildYear ? `${basic.buildYear}년` : null },
        { icon: Car, label: '주차', value: basic.parkingRatio ? `${basic.parkingRatio}대/세대` : null },
        { icon: Layers, label: '최고층', value: basic.floors ? `${basic.floors}층` : null },
    ].filter(item => item.value);

    return (
        <div className="space-y-3">
            {/* 평균 거래가 */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs text-muted-foreground mb-0.5">평균 실거래가</div>
                        <div className="text-2xl font-bold text-primary">
                            {formatPriceShort(price?.avgPrice || 0)}
                        </div>
                    </div>
                    {(price?.pricePerPyeong || 0) > 0 && (
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground mb-0.5">평당가</div>
                            <div className="text-lg font-semibold">
                                {formatPriceShort(price?.pricePerPyeong || 0)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 단지 정보 그리드 */}
            <div className="grid grid-cols-3 gap-2">
                {infoItems.map((item, idx) => (
                    <div key={idx} className="bg-accent/50 rounded-lg p-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                            <item.icon className="w-3 h-3" />
                            {item.label}
                        </div>
                        <div className="font-semibold text-xs">{item.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
