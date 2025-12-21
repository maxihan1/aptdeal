'use client';

import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface PriceTrendSectionProps {
    priceTrend: Array<{
        month: string;
        [key: string]: string | number; // 면적별 가격: { month: '2025-01', 소형: 50000, 중형: 80000, ... }
    }>;
    rentTrend: Array<{
        month: string;
        avgDeposit?: number;
        [key: string]: string | number | undefined;
    }>;
    showSales?: boolean;  // 매매 차트 표시 여부 (기본 true)
    showRent?: boolean;   // 전세 차트 표시 여부 (기본 true)
}

// 억/천만 포맷
function formatPriceShort(price: number): string {
    if (!price || price === 0) return '-';
    const eok = price / 10000;
    if (eok >= 1) {
        const remainder = Math.round(price % 10000);
        return remainder > 0 ? `${Math.floor(eok)}억 ${remainder.toLocaleString()}만` : `${eok.toFixed(1)}억`;
    }
    return `${Math.round(price).toLocaleString()}만`;
}

// 면적별 동적 색상 생성 (HSL 사용) - 매매용 (파란색~빨간색 스펙트럼)
const getAreaColor = (area: string, index: number, total: number) => {
    // 작은 면적: 파란색, 중간: 녹색, 큰 면적: 빨간색
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    if (total <= colors.length) {
        return colors[index % colors.length];
    }
    // 6개 이상이면 HSL로 균등 분배
    const hue = Math.round((index / Math.max(total - 1, 1)) * 300); // 0(빨강) ~ 300(보라)
    return `hsl(${hue}, 70%, 50%)`;
};

// 전세용 색상 (보라색~청록색 스펙트럼)
const getRentAreaColor = (area: string, index: number, total: number) => {
    // 작은 면적: 보라, 중간: 핑크, 큰 면적: 청록
    const colors = ['#8B5CF6', '#D946EF', '#F43F5E', '#FB923C', '#14B8A6', '#06B6D4'];
    if (total <= colors.length) {
        return colors[index % colors.length];
    }
    const hue = Math.round(180 + (index / Math.max(total - 1, 1)) * 180); // 180(청록) ~ 360(빨강)
    return `hsl(${hue}, 65%, 55%)`;
};

export default function PriceTrendSection({ priceTrend, rentTrend, showSales = true, showRent = true }: PriceTrendSectionProps) {
    // 데이터 구조 감지: 기존(avgPrice) vs 새로운(면적별)
    const isLegacyFormat = useMemo(() => {
        if (!priceTrend || priceTrend.length === 0) return true;
        // avgPrice 필드가 있으면 기존 포맷
        return 'avgPrice' in priceTrend[0];
    }, [priceTrend]);

    // 면적 키 추출 및 정렬 (month, avgPrice, dealCount 제외)
    const areaKeys = useMemo(() => {
        if (!priceTrend || priceTrend.length === 0) return [];
        if (isLegacyFormat) return ['평균']; // 기존 포맷은 '평균' 하나만

        const keys = new Set<string>();
        priceTrend.forEach(item => {
            Object.keys(item).forEach(key => {
                if (key !== 'month' && key !== 'avgPrice' && key !== 'dealCount') {
                    // 숫자 또는 문자열 숫자
                    const val = item[key];
                    if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                        keys.add(key);
                    }
                }
            });
        });
        // 면적 숫자로 파싱해서 정렬 (59㎡ → 59)
        return Array.from(keys).sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
            return numA - numB;
        });
    }, [priceTrend, isLegacyFormat]);

    // 차트 데이터 변환 (기존 포맷 호환)
    const chartData = useMemo(() => {
        if (!priceTrend || priceTrend.length === 0) return [];
        if (isLegacyFormat) {
            // 기존 포맷: avgPrice -> 평균으로 변환
            return priceTrend.map(item => ({
                month: item.month,
                평균: typeof item.avgPrice === 'string' ? Number(item.avgPrice) : (item.avgPrice || 0)
            }));
        }
        return priceTrend;
    }, [priceTrend, isLegacyFormat]);

    // 전세 데이터 면적 키 추출
    const rentAreaKeys = useMemo(() => {
        if (!rentTrend || rentTrend.length === 0) return [];

        // 기존 포맷 감지 (avgDeposit 필드가 있으면 기존 포맷)
        const isLegacyRent = 'avgDeposit' in (rentTrend[0] || {});
        if (isLegacyRent) return ['전세']; // 기존 포맷은 '전세' 하나만

        const keys = new Set<string>();
        rentTrend.forEach(item => {
            Object.keys(item).forEach(key => {
                if (key !== 'month' && key !== 'avgDeposit' && key !== 'dealCount') {
                    const val = item[key];
                    if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                        keys.add(key);
                    }
                }
            });
        });
        return Array.from(keys).sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
            return numA - numB;
        });
    }, [rentTrend]);

    // 전세 추이 데이터 변환 (기존 구조 호환 + 면적별 구조 지원)
    const rentData = useMemo(() => {
        if (!rentTrend || rentTrend.length === 0) return [];

        const isLegacyRent = 'avgDeposit' in (rentTrend[0] || {});
        if (isLegacyRent) {
            return rentTrend.map(item => ({
                month: item.month,
                전세: typeof item.avgDeposit === 'string' ? Number(item.avgDeposit) : (item.avgDeposit || 0)
            }));
        }
        return rentTrend;
    }, [rentTrend]);

    const hasPrice = showSales && priceTrend && priceTrend.length > 0 && areaKeys.length > 0;
    const hasRent = showRent && rentData.length > 0 && rentAreaKeys.length > 0;

    if (!hasPrice && !hasRent) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                가격 추이 데이터가 없습니다
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                3년 {hasPrice && !hasRent ? '매매' : hasRent && !hasPrice ? '전세' : ''} 가격 추이
            </h4>

            {/* 매매 차트 */}
            {hasPrice && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">매매</span>
                        <div className="flex gap-2 flex-wrap">
                            {areaKeys.map((key, idx) => (
                                <span key={key} className="flex items-center gap-1 text-[10px]">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getAreaColor(key, idx, areaKeys.length) }}
                                    />
                                    {key}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="bg-accent/10 rounded-lg p-2">
                        <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <defs>
                                        {areaKeys.map((key, idx) => {
                                            const color = getAreaColor(key, idx, areaKeys.length);
                                            return (
                                                <linearGradient key={key} id={`gradient-${key.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                                </linearGradient>
                                            );
                                        })}
                                    </defs>
                                    <XAxis
                                        dataKey="month"
                                        tick={{ fontSize: 9 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => v.slice(5)} // 2025-01 -> 01
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 9 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                                        width={35}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '8px',
                                            padding: '8px',
                                            fontSize: '11px'
                                        }}
                                        formatter={(value: number, name: string) => [formatPriceShort(value), name]}
                                        labelFormatter={(label) => label}
                                    />
                                    {areaKeys.map((key, idx) => (
                                        <Area
                                            key={key}
                                            type="monotone"
                                            dataKey={key}
                                            stroke={getAreaColor(key, idx, areaKeys.length)}
                                            strokeWidth={2}
                                            fill={`url(#gradient-${key.replace(/[^a-zA-Z0-9]/g, '')})`}
                                            dot={false}
                                            connectNulls
                                        />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* 전세 차트 (면적별) */}
            {hasRent && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">전세</span>
                        <div className="flex gap-2 flex-wrap">
                            {rentAreaKeys.map((key, idx) => (
                                <span key={key} className="flex items-center gap-1 text-[10px]">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getRentAreaColor(key, idx, rentAreaKeys.length) }}
                                    />
                                    {key}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="bg-accent/10 rounded-lg p-2">
                        <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={rentData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <defs>
                                        {rentAreaKeys.map((key, idx) => {
                                            const color = getRentAreaColor(key, idx, rentAreaKeys.length);
                                            return (
                                                <linearGradient key={key} id={`gradient-rent-${key.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                                </linearGradient>
                                            );
                                        })}
                                    </defs>
                                    <XAxis
                                        dataKey="month"
                                        tick={{ fontSize: 9 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => v.slice(5)}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 9 }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                                        width={35}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '8px',
                                            padding: '8px',
                                            fontSize: '11px'
                                        }}
                                        formatter={(value: number, name: string) => [formatPriceShort(value), name]}
                                        labelFormatter={(label) => label}
                                    />
                                    {rentAreaKeys.map((key, idx) => (
                                        <Area
                                            key={key}
                                            type="monotone"
                                            dataKey={key}
                                            stroke={getRentAreaColor(key, idx, rentAreaKeys.length)}
                                            strokeWidth={2}
                                            fill={`url(#gradient-rent-${key.replace(/[^a-zA-Z0-9]/g, '')})`}
                                            dot={false}
                                            connectNulls
                                        />
                                    ))}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
