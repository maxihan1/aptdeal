"use client"

import { Line, Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { useTheme } from "next-themes"

interface PriceChartProps {
    data: {
        date: string;
        [key: string]: string | number; // area keys like "84㎡": 120000
    }[];
    areas: string[];
    colors?: Record<string, string>;
}

export function PriceChart({ data, areas, colors }: PriceChartProps) {
    const { theme } = useTheme()

    // ID 생성을 위한 함수 (특수문자 제거)
    const getSafeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '');

    return (
        <div className="h-[300px] sm:h-[350px] md:h-[450px] w-full mt-4 relative">
            <ResponsiveContainer width="99%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                        {areas.map((area, index) => {
                            const safeId = getSafeId(area);
                            const color = colors?.[area] || `hsl(${(index * 137) % 360}, 70%, 50%)`;
                            return (
                                <linearGradient key={`gradient-${safeId}`} id={`gradient-${safeId}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                    <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                            const [y, m, d] = value.split('-');
                            return `${m}.${d}`;
                        }}
                        minTickGap={30}
                        dy={10}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${(value / 10000).toFixed(1)}억`}
                        width={45}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderRadius: '12px',
                            border: '1px solid hsl(var(--border))',
                            boxShadow: '0 8px 16px -4px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.1)'
                        }}
                        itemStyle={{ color: 'hsl(var(--foreground))', fontSize: '13px', padding: '2px 0' }}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem', fontSize: '12px' }}
                        formatter={(value: number, name: string) => {
                            // Find area name for color lookup if needed, but 'itemStyle' is general. 
                            // Recharts handles color squares automatically based on line stroke?
                            // Yes, usually.
                            const eok = Math.floor(value / 10000);
                            const remainder = Math.round(value % 10000);
                            const formatted = eok > 0
                                ? (remainder > 0 ? `${eok}억 ${remainder.toLocaleString()}만원` : `${eok}억`)
                                : `${remainder.toLocaleString()}만원`;
                            return [formatted, '거래가'];
                        }}
                        cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {areas.map((area, index) => {
                        const safeId = getSafeId(area);
                        const color = colors?.[area] || `hsl(${(index * 137) % 360}, 70%, 50%)`;
                        return (
                            <Area
                                key={area}
                                type="monotone"
                                dataKey={area}
                                name={`${area}`} // area has symbol usually
                                stroke={color}
                                strokeWidth={3}
                                fill={`url(#gradient-${safeId})`}
                                dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))", stroke: color }}
                                activeDot={{ r: 7, strokeWidth: 0, fill: color }}
                                connectNulls
                            />
                        );
                    })}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}
