/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Calendar, MapPin, TrendingDown } from "lucide-react"

// Deal interface duplicated for now to avoid circular deps or complex imports
// In real app, share types
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
        [key: string]: any;
    };
}

export function DealCard({ deal }: DealCardProps) {
    const isRent = deal.dealType === 'rent' || !!deal.deposit;

    return (
        <Card className="mb-3 hover:shadow-md transition-shadow dark:bg-card/50">
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className="text-base font-bold line-clamp-1">
                            {deal.aptName}
                        </CardTitle>
                        <div className="flex items-center text-xs text-muted-foreground gap-1">
                            <MapPin className="h-3 w-3" />
                            {deal.region} {deal.dong}
                        </div>
                    </div>
                    <Badge variant={isRent ? "secondary" : "default"} className="text-xs">
                        {isRent ? '전월세' : '매매'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
                <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-blue-600">
                        {isRent
                            ? `보증금 ${typeof deal.deposit === 'number' ? deal.deposit.toLocaleString() : '0'}만원${deal.rent ? ` / 월 ${deal.rent.toLocaleString()}만원` : ''}`
                            : `${(deal.price ?? 0).toLocaleString()}만원`
                        }
                    </div>
                    <div className="text-sm font-medium">
                        {deal.area}㎡ <span className="text-muted-foreground text-xs">({Math.round(deal.area / 3.3)}평)</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
                    <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {deal.floor}층 / {deal.buildYear}년식
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                        <Calendar className="h-3 w-3" />
                        {deal.dealYear}.{deal.dealMonth}.{deal.dealDay}
                    </div>
                </div>

                {deal.cdealType && (
                    <div className="text-xs text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-900/20 p-1 px-2 rounded">
                        <TrendingDown className="h-3 w-3" />
                        계약 취소 ({deal.cdealDay})
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
