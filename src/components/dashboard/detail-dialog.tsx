"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface DetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    type: 'ranking' | 'deals';
    data: any[];
    loading: boolean;
    onLoadMore?: () => void;
    hasMore?: boolean;
}

export function DetailDialog({ open, onOpenChange, title, type, data, loading, onLoadMore, hasMore }: DetailDialogProps) {
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLDivElement | null) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && onLoadMore) {
                onLoadMore();
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, hasMore, onLoadMore]);

    // 금액 포맷터
    const formatPrice = (price: number) => {
        if (!price) return '0원';
        const eok = Math.floor(price / 10000);
        const chun = price % 10000;
        let result = '';
        if (eok > 0) result += `${eok}억 `;
        if (chun > 0) result += `${chun.toLocaleString()}`;
        return result.trim();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-4 md:p-6 gap-4">
                <DialogHeader className="pb-2">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        {title}
                        {/* Remove count badge as requested */}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {title} 목록입니다.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-1 -mr-2 md:mr-0 scrollbar-hide">
                    <div className={type === 'ranking' ? "grid grid-cols-1 gap-3 pb-4" : "grid grid-cols-1 md:grid-cols-2 gap-3 pb-4"}>
                        {type === 'ranking' ? (
                            data.map((row, i) => (
                                <div key={i} className="flex items-center p-4 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg mr-4 ${row.rank <= 3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                        }`}>
                                        {row.rank}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold truncate">{row.region}</div>
                                        <div className="text-sm text-muted-foreground">거래량</div>
                                    </div>
                                    <div className="text-right font-bold text-lg">
                                        {row.count.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-1">건</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            data.map((row, i) => {
                                const isCancelled = ['Y', 'O'].includes(row.cdealType || '');
                                const isLast = i === data.length - 1;
                                return (
                                    <div
                                        key={row.id || i}
                                        ref={isLast ? lastElementRef : null}
                                        className={`flex flex-col p-4 border rounded-xl shadow-sm hover:shadow-md transition-all relative overflow-hidden ${isCancelled ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50' : 'bg-card'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1 min-w-0 pr-2">
                                                <div className="font-bold text-base truncate flex items-center gap-2">
                                                    {row.aptName}
                                                    <span className="text-xs font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                        {Math.round(row.area / 3.3058)}평
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate">{row.region}</div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end mt-3 pt-3 border-t border-dashed border-muted/50">
                                            <div className="text-xs text-muted-foreground">
                                                {row.date} 거래
                                            </div>
                                            <div className="flex flex-col items-end">
                                                {isCancelled && <span className="text-[11px] font-medium text-orange-600 dark:text-orange-400 mb-0.5">거래 취소</span>}
                                                <div className={`font-bold text-base ${isCancelled ? 'text-muted-foreground line-through decoration-orange-500/50 decoration-2 opacity-70' : 'text-primary'}`}>
                                                    {formatPrice(row.price)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
