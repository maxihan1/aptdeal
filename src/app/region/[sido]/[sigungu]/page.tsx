"use client";
import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { trackAptDetail } from '@/lib/gtag';
import Link from 'next/link';
import axios from 'axios';
import { DealCard } from "@/components/region/deal-card";

interface Deal {
    id: string;
    region: string;
    address: string;
    area: number;
    price: number;
    date: string;
    aptName: string;
    aptNm: string;
    floor: number;
    aptDong?: string;
    buildYear: number;
    dealMonth: number;
    dealDay: number;
    tradeType: string;
    cdealType: string;
}

interface RentDeal {
    id: string;
    region: string;
    aptName: string;
    aptNm: string;
    area: number;
    deposit: number;
    rent: number;
    date: string;
    rentType: string;
    buildYear: number;
}

function SemanticRegionContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    // URL에서 시도/시군구 가져오기
    const sido = decodeURIComponent(params.sido as string || "");
    const sigungu = decodeURIComponent(params.sigungu as string || "");
    const dong = searchParams.get("d") || "";
    const dealType = searchParams.get("t") || "trade";

    // 날짜는 로컬스토리지에서 읽기
    const getDefaultDates = () => {
        const today = new Date();
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(today.getMonth() - 3);
        return {
            start: threeMonthsAgo.toISOString().split('T')[0],
            end: today.toISOString().split('T')[0]
        };
    };

    const defaultDates = getDefaultDates();
    const [startDate, setStartDate] = useState(defaultDates.start);
    const [endDate, setEndDate] = useState(defaultDates.end);
    const [deals, setDeals] = useState<(Deal | RentDeal)[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAptName, setSelectedAptName] = useState<string | null>(null);
    const [selectedArea, setSelectedArea] = useState<number | string | null>(null);
    const [sortField, setSortField] = useState<'price' | 'area' | 'date' | 'aptName' | 'buildYear' | 'cdealType' | 'deposit'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // 날짜 로드
    useEffect(() => {
        try {
            const cached = localStorage.getItem("apt_filter_state");
            if (cached) {
                const state = JSON.parse(cached);
                if (state.startDate) setStartDate(state.startDate);
                if (state.endDate) setEndDate(state.endDate);
            }
        } catch { }
    }, []);

    // 데이터 로드
    const fetchDeals = useCallback(async () => {
        if (!sido || !sigungu) return;

        setLoading(true);
        try {
            const params: Record<string, string> = { sido, sigungu, startDate, endDate };
            if (dong) params.dong = dong;

            if (dealType === 'rent') {
                const res = await axios.get('/api/rent', { params });
                setDeals(res.data);
            } else {
                const res = await axios.get('/api/deals', { params });
                setDeals(res.data);
            }
        } catch {
            setDeals([]);
        } finally {
            setLoading(false);
        }
    }, [sido, sigungu, dong, startDate, endDate, dealType]);

    useEffect(() => {
        fetchDeals();
    }, [fetchDeals]);

    // 필터링 및 정렬
    const normalizeName = (name: string) => (name || '').replace(/\s/g, '').toLowerCase();

    const filteredDeals = useMemo(() => {
        let result = [...deals];
        if (selectedAptName) {
            result = result.filter(deal => deal.aptName === selectedAptName);
        }
        if (selectedArea) {
            result = result.filter(deal => Math.floor(deal.area) === Number(selectedArea));
        }

        // 정렬
        result.sort((a: any, b: any) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (sortField === 'date') {
                aVal = new Date(a.date).getTime();
                bVal = new Date(b.date).getTime();
            }
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [deals, selectedAptName, selectedArea, sortField, sortOrder]);

    const availableAptNames = useMemo(() =>
        Array.from(new Set(deals.map(d => d.aptName))).sort((a, b) => a.localeCompare(b, 'ko'))
        , [deals]);

    const availableAreas = useMemo(() => {
        const target = selectedAptName ? deals.filter(d => d.aptName === selectedAptName) : deals;
        return Array.from(new Set(target.map(d => Math.floor(d.area)))).sort((a, b) => a - b);
    }, [deals, selectedAptName]);

    const totalPages = Math.ceil(filteredDeals.length / itemsPerPage);
    const pagedDeals = filteredDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const getSortIcon = (field: string) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3" />;
        return sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
    };

    const toggleSort = (field: any) => {
        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const formatPrice = (price: number) => {
        if (price === 0) return '0원';
        const eok = Math.floor(price / 10000);
        const chun = price % 10000;
        let result = '';
        if (eok > 0) result += `${eok}억`;
        if (chun > 0) result += ` ${chun.toLocaleString()}만원`;
        else if (eok > 0) result = result.trim();
        return result || '0원';
    };

    const getSearchLocationText = () => {
        if (sido && sigungu && dong) return `${sido} ${sigungu} ${dong}`;
        if (sido && sigungu) return `${sido} ${sigungu}`;
        return '지역을 선택해주세요';
    };

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border rounded-xl shadow-lg p-6 flex flex-col items-center gap-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <div className="text-center">
                            <p className="text-lg font-semibold text-foreground">데이터 로딩 중</p>
                            <p className="text-sm text-muted-foreground">잠시만 기다려주세요...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 뒤로가기 */}
            <div className="block lg:hidden mb-2">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>&larr; 뒤로가기</Button>
            </div>

            {/* 헤더 */}
            <Card className="mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-xl">{getSearchLocationText()}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        {dealType === 'rent' ? '전월세' : '매매'} 거래 내역 ({filteredDeals.length}건)
                    </p>
                </CardHeader>
            </Card>

            {/* 단지 선택 및 필터 */}
            <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <Select
                    value={selectedAptName || "all"}
                    onValueChange={(value) => setSelectedAptName(value === "all" ? null : value)}
                >
                    <SelectTrigger className="w-full sm:w-[240px] bg-background">
                        <SelectValue placeholder="단지 선택 (전체)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">전체 단지 ({deals.length}건)</SelectItem>
                        {availableAptNames.map(name => (
                            <SelectItem key={name} value={name}>
                                {name} ({deals.filter(d => d.aptName === name).length}건)
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* 모바일 정렬 버튼 */}
            <div className="lg:hidden flex flex-wrap gap-2 mb-4">
                <Button size="sm" variant={sortField === 'area' ? 'default' : 'outline'} onClick={() => toggleSort('area')}>전용면적 {getSortIcon('area')}</Button>
                <Button size="sm" variant={sortField === 'price' ? 'default' : 'outline'} onClick={() => toggleSort('price')}>가격 {getSortIcon('price')}</Button>
                <Button size="sm" variant={sortField === 'date' ? 'default' : 'outline'} onClick={() => toggleSort('date')}>날짜 {getSortIcon('date')}</Button>
            </div>

            {/* 결과 리스트 */}
            {filteredDeals.length > 0 ? (
                <>
                    {/* PC 테이블 */}
                    <div className="hidden lg:block">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            {dealType === 'rent' ? (
                                                <tr className="border-b bg-muted/30">
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">지역</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">단지명</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('area')}>
                                                        <span className="inline-flex items-center justify-center gap-1">전용면적 {getSortIcon('area')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('deposit')}>
                                                        <span className="inline-flex items-center justify-center gap-1">보증금 {getSortIcon('deposit')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">월세</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('date')}>
                                                        <span className="inline-flex items-center justify-center gap-1">계약일 {getSortIcon('date')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('buildYear')}>
                                                        <span className="inline-flex items-center justify-center gap-1">건축년도 {getSortIcon('buildYear')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">상세</th>
                                                </tr>
                                            ) : (
                                                <tr className="border-b bg-muted/30">
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">지역</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">단지명</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('area')}>
                                                        <span className="inline-flex items-center justify-center gap-1">전용면적 {getSortIcon('area')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">동</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">층</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('price')}>
                                                        <span className="inline-flex items-center justify-center gap-1">거래금액 {getSortIcon('price')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('date')}>
                                                        <span className="inline-flex items-center justify-center gap-1">계약일 {getSortIcon('date')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">거래유형</th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('buildYear')}>
                                                        <span className="inline-flex items-center justify-center gap-1">건축년도 {getSortIcon('buildYear')}</span>
                                                    </th>
                                                    <th className="py-3 px-2 text-center whitespace-nowrap font-semibold">상세</th>
                                                </tr>
                                            )}
                                        </thead>
                                        <tbody>
                                            {pagedDeals.map((deal: any) => {
                                                const isCancelled = ['Y', 'O'].includes(deal.cdealType || '');
                                                return (
                                                    <tr key={deal.id} className={`border-b hover:bg-muted/50 ${isCancelled ? 'bg-red-50/50 dark:bg-red-900/10 opacity-70' : ''}`}>
                                                        <td className="py-2 text-center px-2">{deal.region}</td>
                                                        <td className="py-2 text-center font-bold px-2">
                                                            {deal.aptName}
                                                            {isCancelled && <span className="ml-1 text-xs text-red-500 font-normal">[취소]</span>}
                                                        </td>
                                                        <td className="py-2 text-center px-2">{deal.area}㎡ <span className="text-muted-foreground">({Math.round(deal.area / 2.48)}평)</span></td>
                                                        {dealType === 'rent' ? (
                                                            <>
                                                                <td className={`py-2 text-center font-bold px-2 ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                                                                    {formatPrice(deal.deposit)}
                                                                </td>
                                                                <td className="py-2 text-center px-2">{deal.rent ? `${deal.rent.toLocaleString()}만원` : '전세'}</td>
                                                                <td className="py-2 text-center px-2">{deal.date}</td>
                                                                <td className="py-2 text-center px-2">{deal.buildYear}</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="py-2 text-center px-2">{deal.aptDong || '-'}</td>
                                                                <td className="py-2 text-center px-2">{deal.floor}층</td>
                                                                <td className={`py-2 text-center font-bold px-2 ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                                                                    {formatPrice(deal.price)}
                                                                </td>
                                                                <td className="py-2 text-center px-2">{deal.date}</td>
                                                                <td className="py-2 text-center px-2">{deal.tradeType || '중개거래'}</td>
                                                                <td className="py-2 text-center px-2">{deal.buildYear}</td>
                                                            </>
                                                        )}
                                                        <td className="py-2 text-center px-2">
                                                            <Link href={`/apt/${encodeURIComponent(deal.aptNm || deal.aptName)}?s=${encodeURIComponent(sido)}&g=${encodeURIComponent(sigungu)}&d=${encodeURIComponent(dong)}&t=${dealType}&n=${encodeURIComponent(deal.aptName)}`}>
                                                                <Button size="sm" variant="outline" onClick={() => trackAptDetail(deal.aptName)}>
                                                                    <TrendingUp className="w-4 h-4 mr-1" /> 상세
                                                                </Button>
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {/* 페이지네이션 */}
                                <div className="flex justify-center items-center gap-2 mt-4">
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>이전</Button>
                                    <span className="text-sm">{currentPage} / {totalPages || 1}</span>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>다음</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* 모바일 리스트 */}
                    <div className="lg:hidden space-y-2">
                        {pagedDeals.map((deal: any) => (
                            <Link key={deal.id} href={`/apt/${encodeURIComponent(deal.aptNm || deal.aptName)}?s=${encodeURIComponent(sido)}&g=${encodeURIComponent(sigungu)}&d=${encodeURIComponent(dong)}&t=${dealType}&n=${encodeURIComponent(deal.aptName)}`}>
                                <DealCard deal={{ ...deal, dealType }} />
                            </Link>
                        ))}
                        <div className="flex justify-center items-center gap-2 mt-4 pb-4">
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>이전</Button>
                            <span className="text-sm">{currentPage} / {totalPages || 1}</span>
                            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>다음</Button>
                        </div>
                    </div>
                </>
            ) : (
                !loading && <div className="text-center py-10 text-gray-500">거래 데이터가 없습니다.</div>
            )}
        </div>
    );
}

export default function SemanticRegionPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <SemanticRegionContent />
        </Suspense>
    );
}
