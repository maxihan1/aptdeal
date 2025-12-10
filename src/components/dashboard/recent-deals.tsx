"use client"
import { useEffect, useState } from "react";
import axios from "axios";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Deal {
    id: string;
    aptName: string;
    area: number;
    price: number;
    deposit?: number;
    rent?: number;
    region: string;
    dealType?: string;
}

export function RecentDeals() {
    const [deals, setDeals] = useState<Deal[]>([]);

    useEffect(() => {
        // Fetch recent 5 deals
        axios.get('/api/deals', { params: { limit: 5 } }).then(res => {
            setDeals(res.data.slice(0, 5));
        });
    }, []);

    const formatPrice = (deal: Deal) => {
        const isRent = deal.dealType === 'rent' || !!deal.deposit;
        if (isRent) {
            const deposit = deal.deposit ? `${Math.floor(deal.deposit / 10000) > 0 ? `${Math.floor(deal.deposit / 10000)}억 ` : ''}${(deal.deposit % 10000).toLocaleString()}만원` : '0원';
            const rent = deal.rent ? ` / ${deal.rent.toLocaleString()}만원` : '';
            return `보증금 ${deposit}${rent}`;
        }
        return `+ ${Math.floor(deal.price / 10000)}억 ${(deal.price % 10000).toLocaleString()}만원`;
    };

    return (
        <div className="space-y-8">
            {deals.map((deal) => (
                <div key={deal.id} className="flex items-center">
                    <Avatar className="h-9 w-9 bg-primary/10">
                        <AvatarFallback className="text-primary font-bold text-xs">
                            {deal.aptName.substring(0, 2)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="ml-4 space-y-1">
                        <p className="text-sm font-medium leading-none">{deal.aptName}</p>
                        <p className="text-xs text-muted-foreground w-40 truncate">
                            {deal.region} · {Math.round(deal.area / 3.3)}평 ({deal.area}㎡)
                        </p>
                    </div>
                    <div className="ml-auto font-medium text-xs text-right min-w-[100px]">
                        {formatPrice(deal)}
                    </div>
                </div>
            ))}
        </div>
    );
}
