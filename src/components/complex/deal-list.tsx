"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Deal {
    id?: string;
    date: string;
    area: number;
    floor: number | string;
    price: number;
    aptDong?: string;
    cdealType?: string;
    tradeType?: string;
    dealingGbn?: string;
    // 전월세
    deposit?: number;
    monthlyRent?: number;
    rent?: number;
    contractType?: string;
}

interface DealListProps {
    deals: Deal[];
    dealType: "trade" | "rent";
    selectedArea?: string;
    pageSize?: number;
}

export function DealList({ deals, dealType, selectedArea = "전체", pageSize = 15 }: DealListProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<"date" | "price" | "area">("date");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [areaFilter, setAreaFilter] = useState(selectedArea);

    // 면적 옵션 추출
    const areaOptions = useMemo(() => {
        const areas = Array.from(new Set(deals.map(d => Math.floor(d.area) + "㎡")));
        return ["전체", ...areas.sort((a, b) => parseFloat(a) - parseFloat(b))];
    }, [deals]);

    // 필터링 및 정렬
    const filteredAndSortedDeals = useMemo(() => {
        let result = [...deals];

        // 면적 필터
        if (areaFilter !== "전체") {
            const targetArea = parseFloat(areaFilter);
            result = result.filter(d => Math.floor(d.area) === targetArea);
        }

        // 정렬
        result.sort((a, b) => {
            let comparison = 0;
            if (sortField === "date") {
                comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            } else if (sortField === "price") {
                const priceA = dealType === "rent" ? (a.deposit || 0) : a.price;
                const priceB = dealType === "rent" ? (b.deposit || 0) : b.price;
                comparison = priceA - priceB;
            } else if (sortField === "area") {
                comparison = a.area - b.area;
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [deals, areaFilter, sortField, sortOrder, dealType]);

    // 페이지네이션
    const totalPages = Math.ceil(filteredAndSortedDeals.length / pageSize);
    const paginatedDeals = filteredAndSortedDeals.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    // 면적 필터 변경 시 첫 페이지로
    const handleAreaChange = (value: string) => {
        setAreaFilter(value);
        setCurrentPage(1);
    };

    // 정렬 토글
    const toggleSort = (field: "date" | "price" | "area") => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
        setCurrentPage(1);
    };

    // 가격 포맷팅
    const formatPrice = (price: number) => {
        if (price >= 10000) {
            const eok = Math.floor(price / 10000);
            const man = price % 10000;
            return man > 0 ? `${eok}억 ${man.toLocaleString()}` : `${eok}억`;
        }
        return `${price.toLocaleString()}만`;
    };

    // 날짜 포맷팅
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    if (deals.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground">
                거래 내역이 없습니다.
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                        📋 거래 내역
                        <span className="text-sm font-normal text-muted-foreground">
                            ({filteredAndSortedDeals.length}건)
                        </span>
                    </h3>
                    <div className="flex items-center gap-2">
                        <Select value={areaFilter} onValueChange={handleAreaChange}>
                            <SelectTrigger className="w-[100px] h-8 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {areaOptions.map(area => (
                                    <SelectItem key={area} value={area}>{area}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th
                                className="px-4 py-2.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                onClick={() => toggleSort("date")}
                            >
                                <span className="flex items-center gap-1">
                                    거래일
                                    <ArrowUpDown className={cn("h-3 w-3", sortField === "date" && "text-primary")} />
                                </span>
                            </th>
                            <th
                                className="px-4 py-2.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                onClick={() => toggleSort("area")}
                            >
                                <span className="flex items-center gap-1">
                                    면적
                                    <ArrowUpDown className={cn("h-3 w-3", sortField === "area" && "text-primary")} />
                                </span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">층</th>
                            {dealType === "trade" ? (
                                <th
                                    className="px-4 py-2.5 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                    onClick={() => toggleSort("price")}
                                >
                                    <span className="flex items-center justify-end gap-1">
                                        거래가
                                        <ArrowUpDown className={cn("h-3 w-3", sortField === "price" && "text-primary")} />
                                    </span>
                                </th>
                            ) : (
                                <>
                                    <th
                                        className="px-4 py-2.5 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                        onClick={() => toggleSort("price")}
                                    >
                                        <span className="flex items-center justify-end gap-1">
                                            보증금
                                            <ArrowUpDown className={cn("h-3 w-3", sortField === "price" && "text-primary")} />
                                        </span>
                                    </th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">월세</th>
                                </>
                            )}
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                {dealType === "trade" ? "거래유형" : "계약유형"}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedDeals.map((deal, index) => {
                            const isCancelled = deal.cdealType && deal.cdealType.trim() !== "";
                            return (
                                <tr
                                    key={deal.id || index}
                                    className={cn(
                                        "hover:bg-muted/30 transition-colors",
                                        isCancelled && "bg-red-50/50 dark:bg-red-900/10"
                                    )}
                                >
                                    <td className={cn("px-4 py-2.5", isCancelled && "line-through text-muted-foreground")}>
                                        {formatDate(deal.date)}
                                    </td>
                                    <td className={cn("px-4 py-2.5", isCancelled && "line-through text-muted-foreground")}>
                                        {Math.floor(deal.area)}㎡
                                        <span className="text-muted-foreground ml-1">
                                            ({(deal.area / 2.48).toFixed(0)}평)
                                        </span>
                                    </td>
                                    <td className={cn("px-4 py-2.5", isCancelled && "line-through text-muted-foreground")}>
                                        {deal.floor}층
                                        {deal.aptDong && deal.aptDong.trim() && (
                                            <span className="text-muted-foreground ml-1">({deal.aptDong}동)</span>
                                        )}
                                    </td>
                                    {dealType === "trade" ? (
                                        <td className={cn(
                                            "px-4 py-2.5 text-right font-medium",
                                            isCancelled ? "line-through text-muted-foreground" : "text-primary"
                                        )}>
                                            {formatPrice(deal.price)}
                                        </td>
                                    ) : (
                                        <>
                                            <td className={cn(
                                                "px-4 py-2.5 text-right font-medium",
                                                isCancelled ? "line-through text-muted-foreground" : "text-primary"
                                            )}>
                                                {formatPrice(deal.deposit || 0)}
                                            </td>
                                            <td className={cn(
                                                "px-4 py-2.5 text-right",
                                                isCancelled && "line-through text-muted-foreground"
                                            )}>
                                                {(deal.monthlyRent || deal.rent || 0) > 0
                                                    ? `${(deal.monthlyRent || deal.rent || 0).toLocaleString()}만`
                                                    : "-"}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-4 py-2.5 text-center">
                                        {isCancelled ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                취소
                                            </span>
                                        ) : dealType === "trade" ? (
                                            <span className="text-muted-foreground text-xs">
                                                {deal.dealingGbn || deal.tradeType || "-"}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">
                                                {deal.contractType || "-"}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border">
                {paginatedDeals.map((deal, index) => {
                    const isCancelled = deal.cdealType && deal.cdealType.trim() !== "";
                    return (
                        <div
                            key={deal.id || index}
                            className={cn(
                                "p-4 hover:bg-muted/30 transition-colors",
                                isCancelled && "bg-red-50/50 dark:bg-red-900/10"
                            )}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={cn(
                                    "text-sm text-muted-foreground",
                                    isCancelled && "line-through"
                                )}>
                                    {formatDate(deal.date)}
                                </span>
                                {isCancelled ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                        거래취소
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {dealType === "trade"
                                            ? (deal.dealingGbn || deal.tradeType || "")
                                            : (deal.contractType || "")}
                                    </span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <div className={cn(isCancelled && "line-through text-muted-foreground")}>
                                    <span className="text-sm font-medium">
                                        {Math.floor(deal.area)}㎡
                                        <span className="text-muted-foreground font-normal">
                                            ({(deal.area / 2.48).toFixed(0)}평)
                                        </span>
                                    </span>
                                    <span className="text-muted-foreground mx-1">·</span>
                                    <span className="text-sm">
                                        {deal.floor}층
                                        {deal.aptDong && deal.aptDong.trim() && ` (${deal.aptDong}동)`}
                                    </span>
                                </div>
                                <div className={cn(
                                    "text-right",
                                    isCancelled ? "line-through text-muted-foreground" : "text-primary font-semibold"
                                )}>
                                    {dealType === "trade" ? (
                                        formatPrice(deal.price)
                                    ) : (
                                        <div className="text-sm">
                                            <div>{formatPrice(deal.deposit || 0)}</div>
                                            {(deal.monthlyRent || deal.rent || 0) > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    월 {(deal.monthlyRent || deal.rent || 0).toLocaleString()}만
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/20">
                    <div className="text-sm text-muted-foreground">
                        {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredAndSortedDeals.length)} / {filteredAndSortedDeals.length}건
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        {/* 페이지 번호 */}
                        <div className="hidden sm:flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCurrentPage(pageNum)}
                                        className="h-8 w-8 p-0 text-xs"
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>

                        {/* 모바일에서는 현재 페이지 / 전체 페이지 표시 */}
                        <span className="sm:hidden text-sm text-muted-foreground mx-2">
                            {currentPage} / {totalPages}
                        </span>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DealList;
