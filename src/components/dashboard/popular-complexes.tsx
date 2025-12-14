"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

interface PopularComplex {
    aptNm: string;
    region: string;
    sido: string;
    sigungu: string;
    dong: string;
    count: number;
}

interface PopularComplexesProps {
    globalSido: string;
}

export default function PopularComplexes({ globalSido }: PopularComplexesProps) {
    const [complexes, setComplexes] = useState<PopularComplex[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const params: Record<string, string> = {};
                if (globalSido && globalSido !== "ALL") {
                    params.sido = globalSido;
                }
                const res = await axios.get('/api/stats', { params });
                if (res.data.popularComplexes) {
                    setComplexes(res.data.popularComplexes);
                }
            } catch (error) {
                console.error("Failed to fetch popular complexes", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [globalSido]);

    // 날짜 범위 생성 (최근 3개월)
    const getDateRange = () => {
        const today = new Date();
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        return {
            startDate: threeMonthsAgo.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
        };
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <span className="text-xl">🏢</span> 최근 거래 많은 단지 (30일)
                </h2>
            </div>
            <div className="p-0">
                {loading ? (
                    <div className="p-4 space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {complexes.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">데이터가 없습니다.</div>
                        ) : (
                            complexes.map((complex, index) => {
                                // 간결한 URL 구조 사용 (dong 제외 - apt_list와 apt_deal_info 간 불일치 가능)
                                const detailUrl = `/apt/${encodeURIComponent(complex.aptNm)}?s=${encodeURIComponent(complex.sido)}&g=${encodeURIComponent(complex.sigungu)}&t=trade`;

                                return (
                                    <Link
                                        key={index}
                                        href={detailUrl}
                                        className="flex px-4 py-3 items-center justify-between hover:bg-primary/5 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' : index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' : index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' : 'bg-gray-50 text-gray-500 dark:bg-gray-700/30 dark:text-gray-500'}`}>
                                                {index + 1}
                                            </span>
                                            <div>
                                                <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{complex.aptNm}</div>
                                                <div className="text-xs text-muted-foreground">{complex.region}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-bold text-primary">{complex.count}건</span>
                                        </div>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
