/**
 * 지도용 지역별 가격 정보 API
 * GET /api/map/regions
 * 
 * Query Parameters:
 *   - type: sido | sigungu | dong (지역 유형)
 *   - parent: 상위 지역명 (선택)
 *   - sw_lat, sw_lng, ne_lat, ne_lng: 지도 바운드 (선택)
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

interface RegionData extends RowDataPacket {
    region_type: 'sido' | 'sigungu' | 'dong';
    region_code: string;
    region_name: string;
    parent_name: string | null;
    center_lat: number;
    center_lng: number;
    avg_price_30d: number;
    avg_price_90d: number;
    avg_price_365d: number;
    rent_avg_price: number;
    deal_count_30d: number;
    apartment_count: number;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const type = searchParams.get('type') as 'sido' | 'sigungu' | 'dong' | null;
    const parent = searchParams.get('parent');
    const transactionType = searchParams.get('transactionType') as 'sale' | 'rent' | null;
    const swLat = searchParams.get('sw_lat');
    const swLng = searchParams.get('sw_lng');
    const neLat = searchParams.get('ne_lat');
    const neLng = searchParams.get('ne_lng');

    if (!type || !['sido', 'sigungu', 'dong'].includes(type)) {
        return NextResponse.json(
            { error: 'Invalid type. Must be sido, sigungu, or dong' },
            { status: 400 }
        );
    }

    try {
        let query = `
            SELECT 
                region_type,
                region_code,
                region_name,
                parent_name,
                center_lat,
                center_lng,
                avg_price_30d,
                avg_price_90d,
                avg_price_365d,
                COALESCE(rent_avg_price, 0) as rent_avg_price,
                deal_count_30d,
                apartment_count
            FROM region_price_cache
            WHERE region_type = ?
        `;

        const params: (string | number)[] = [type];

        // 상위 지역 필터
        if (parent) {
            query += ` AND parent_name = ?`;
            params.push(parent);
        }

        // 바운드 필터
        if (swLat && swLng && neLat && neLng) {
            query += ` AND center_lat BETWEEN ? AND ?`;
            query += ` AND center_lng BETWEEN ? AND ?`;
            params.push(parseFloat(swLat), parseFloat(neLat));
            params.push(parseFloat(swLng), parseFloat(neLng));
        }

        // 좌표가 있는 것만
        query += ` AND center_lat IS NOT NULL AND center_lng IS NOT NULL`;
        query += ` ORDER BY deal_count_30d DESC`;

        const [rows] = await pool.query<RegionData[]>(query, params);

        // 응답 데이터 변환
        const regions = rows.map((row) => {
            // transactionType에 따라 가격 선택
            const salePrice = row.avg_price_365d || row.avg_price_90d || row.avg_price_30d || 0;
            const rentPrice = row.rent_avg_price || 0;
            const avgPrice = transactionType === 'rent' ? rentPrice : salePrice;

            return {
                id: `${row.region_type}-${row.region_name}`,
                type: row.region_type,
                code: row.region_code,
                name: row.region_name,
                parentName: row.parent_name,
                lat: row.center_lat ? parseFloat(String(row.center_lat)) : 0,
                lng: row.center_lng ? parseFloat(String(row.center_lng)) : 0,
                avgPrice,
                rentPrice,
                salePrice,
                dealCount: row.deal_count_30d || 0,
                apartmentCount: row.apartment_count || 0,
            };
        });

        return NextResponse.json(regions);

    } catch (error) {
        console.error('Error fetching region data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                error: 'Failed to fetch region data',
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
            },
            { status: 500 }
        );
    }
}
