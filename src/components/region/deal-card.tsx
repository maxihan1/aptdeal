/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Calendar, MapPin, XCircle } from "lucide-react"

// Deal interface
interface DealCardProps {
    deal: {
        id: string;
        aptName: string;
        area: number;
        price?: number;
        deposit?: number;
        rent?: number;
        date: string;
        floor?: number;
        region?: string;
        buildYear?: number;
        dealYear?: number;
        dealMonth?: number;
        dealDay?: number;
        cdealType?: string;
        cdealDay?: string;
        [key: string]: any;
    };
}

// 가격 포맷 함수 (1억 5000만원 형식)
function formatKoreanPrice(price: number): string {
    if (!price || price === 0) return '0원';
    const billion = Math.floor(price / 10000);
    const remainder = price % 10000;

    if (billion > 0 && remainder > 0) {
        return `${billion}억 ${remainder.toLocaleString()}만원`;
    } else if (billion > 0) {
        return `${billion}억`;
    }
    return `${remainder.toLocaleString()}만원`;
}

export function DealCard({ deal }: DealCardProps) {
    const isRent = deal.dealType === 'rent' || deal.deposit !== undefined;
    // cdealType이 'Y' 또는 'O'인 경우만 취소된 거래
    const isCancelled = ['Y', 'O'].includes(deal.cdealType || '');

    // 전세(rent=0) vs 월세(rent>0) 구분
    const isJeonse = isRent && (!deal.rent || deal.rent === 0);
    const rentTypeLabel = isRent ? (isJeonse ? '전세' : '월세') : '매매';

    return (
        <Card className={`mb-2 transition-shadow dark:bg-card/50 ${isCancelled ? 'opacity-60 border-red-300 dark:border-red-800' : 'hover:shadow-md'}`}>
            <CardHeader className="p-3 pb-1.5">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-bold line-clamp-1">
                            {deal.aptName}
                        </CardTitle>
                        <div className="flex items-center text-[11px] text-muted-foreground gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{deal.region}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isCancelled && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                <XCircle className="h-3 w-3 mr-0.5" />취소
                            </Badge>
                        )}
                        <Badge
                            className={`text-xs px-2 py-0.5 font-semibold ${isJeonse
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : isRent
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                }`}
                        >
                            {rentTypeLabel}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3 pt-1.5 space-y-2">
                <div className="flex justify-between items-start">
                    <div className={`font-bold ${isCancelled ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                        {isRent ? (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-base">보증금 {formatKoreanPrice(deal.deposit ?? 0)}</span>
                                {!isJeonse && (
                                    <span className="text-sm text-orange-600 dark:text-orange-400">월 {(deal.rent ?? 0).toLocaleString()}만원</span>
                                )}
                            </div>
                        ) : (
                            <span className="text-base">{formatKoreanPrice(deal.price ?? 0)}</span>
                        )}
                    </div>
                    <div className="text-xs font-medium text-muted-foreground text-right">
                        {deal.area}㎡ <span className="text-[10px]">({Math.round(deal.area / 3.3)}평)</span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-muted-foreground bg-muted/50 px-2 py-1.5 rounded">
                    <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {deal.floor ? `${deal.floor}층` : '-'} / {deal.buildYear || '-'}년식
                    </div>
                    <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {deal.date || `${deal.dealYear}.${String(deal.dealMonth).padStart(2, '0')}.${String(deal.dealDay).padStart(2, '0')}`}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
