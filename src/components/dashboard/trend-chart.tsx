"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { useEffect, useState } from "react"
import axios from "axios"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TrendChartProps {
    globalSido: string;
}

export function TrendChart({ globalSido }: TrendChartProps) {
    const [data, setData] = useState<{ date: string; average: number }[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    // Region Filter States
    const [sido, setSido] = useState<string>("서울특별시");
    const [sigungu, setSigungu] = useState<string>(""); // Default blank to show Sido average unless user picks
    const [pyeong, setPyeong] = useState<string>("30");

    // Sync with Global Dashboard Filter
    useEffect(() => {
        if (globalSido && globalSido !== "ALL") {
            setSido(globalSido);
            setSigungu(""); // Reset sigungu when global context changes
        } else {
            // Default to Seoul if global is ALL (or let user pick)
            // But if previously set, keep it? 
            // User requirement: "Default Nationwide". 
            // So if global is ALL, we should probably allow "All Sido". 
            // But for now let's keep "Seoul" as a sane default if global is ALL, OR allow "ALL_SIDO"
            setSido("ALL_SIDO");
            setSigungu("");
        }
    }, [globalSido]);

    // Options
    const [sidoOptions, setSidoOptions] = useState<{ code: string, name: string }[]>([]);
    const [sigunguOptions, setSigunguOptions] = useState<{ code: string, name: string }[]>([]);

    // Fetch Sido Options
    useEffect(() => {
        axios.get('/api/regions/provinces')
            .then(res => setSidoOptions(res.data))
            .catch(console.error);
    }, []);

    // Fetch Sigungu Options
    useEffect(() => {
        if (!sido || sido === "ALL_SIDO") {
            setSigunguOptions([]);
            setSigungu("");
            return;
        }
        axios.get(`/api/regions/cities?province=${sido}`)
            .then(res => setSigunguOptions(res.data))
            .catch(console.error);
    }, [sido]);

    // Fetch Trend Data
    useEffect(() => {
        setLoading(true);
        const params: Record<string, string> = {};
        if (sido && sido !== "ALL_SIDO") {
            params.sido = sido;
        }
        if (sigungu && sigungu !== "ALL_SIGUNGU") {
            params.sigungu = sigungu;
        }
        if (pyeong && pyeong !== "ALL") {
            params.pyeong = pyeong;
        }

        axios.get('/api/stats', { params })
            .then(res => {
                if (res.data.trend) {
                    setData(res.data.trend);
                } else {
                    setData([]);
                }
            })
            .catch(err => {
                console.error("Trend data fetch error:", err);
                setData([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [sido, sigungu, pyeong]);

    return (
        <div className="w-full">
            {/* Filter Controls */}
            <div className="flex gap-1 mb-4 justify-end">
                <div className="w-32">
                    <Select value={sido} onValueChange={(val) => { setSido(val); setSigungu(""); }} disabled={globalSido !== "ALL"}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="시도" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL_SIDO">전국</SelectItem>
                            {sidoOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-32">
                    <Select value={sigungu} onValueChange={setSigungu} disabled={!sido || sido === "ALL_SIDO"}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={(!sido || sido === "ALL_SIDO") ? "시군구 (지역선택필요)" : "시군구"} />
                        </SelectTrigger>
                        <SelectContent>
                            {/* Allow selecting 'All Sigungu' explicitly if needed, but empty string handles it */}
                            <SelectItem value="ALL_SIGUNGU">전체</SelectItem>
                            {sigunguOptions.map(opt => (
                                <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-32">
                    <Select value={pyeong} onValueChange={setPyeong}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="평형" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">전체 평형</SelectItem>
                            <SelectItem value="20">20평대 이하</SelectItem>
                            <SelectItem value="30">30평대</SelectItem>
                            <SelectItem value="40">40평대</SelectItem>
                            <SelectItem value="50">50평대 이상</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {loading ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">데이터 로딩 중...</div>
            ) : data.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">선택한 조건의 거래 데이터가 없습니다.</div>
            ) : (
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${Math.round(value / 10000)}억`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                formatter={(value) => {
                                    if (typeof value !== 'number') return ['-', '평균 거래가'];
                                    return [`${(value / 10000).toFixed(1)}억`, '평균 거래가'];
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="average"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
