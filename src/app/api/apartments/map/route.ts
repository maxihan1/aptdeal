/**
 * 지도용 아파트 좌표 및 가격 정보 API
 * GET /api/apartments/map
 * 
 * Query Parameters:
 *   - region: 시/도 코드 (선택)
 *   - dong: 동 이름 (선택)
 *   - sw_lat, sw_lng, ne_lat, ne_lng: 지도 바운드 (선택)
 *   - limit: 최대 결과 수 (기본: 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

interface ApartmentMapData extends RowDataPacket {
    kaptCode: string;
    kaptName: string;
    kaptAddr: string;
    latitude: number;
    longitude: number;
    kaptdaCnt: number;
    avgPrice: number;
    dealCount: number;
    priceChange: number | null;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const region = searchParams.get('region');
    const dong = searchParams.get('dong');
    const swLat = searchParams.get('sw_lat');
    const swLng = searchParams.get('sw_lng');
    const neLat = searchParams.get('ne_lat');
    const neLng = searchParams.get('ne_lng');
    const limit = parseInt(searchParams.get('limit') || '500');

    try {
        // 좌표가 있는 아파트 조회 + 캐시된 가격 정보 (폴백 로직: 30일 → 90일 → 365일 → 마지막거래)
        let query = `
            SELECT 
                ab.kaptCode as id,
                ab.kaptName as name,
                ab.kaptAddr as address,
                ab.latitude as lat,
                ab.longitude as lng,
                ab.kaptdaCnt as householdCount,
                COALESCE(
                    NULLIF(pc.avg_price_30d, 0),
                    NULLIF(pc.avg_price_90d, 0),
                    NULLIF(pc.avg_price_365d, 0),
                    pc.last_deal_price,
                    0
                ) as avgPrice,
                CASE 
                    WHEN pc.avg_price_30d > 0 THEN 30
                    WHEN pc.avg_price_90d > 0 THEN 90
                    WHEN pc.avg_price_365d > 0 THEN 365
                    WHEN pc.last_deal_price > 0 THEN 0
                    ELSE NULL
                END as pricePeriod,
                pc.deal_count_30d as recentDeals,
                pc.last_deal_date as lastDealDate,
                COALESCE(pc.is_rental, FALSE) as isRental
            FROM apt_basic_info ab
            LEFT JOIN apt_price_cache pc ON ab.kaptCode COLLATE utf8mb4_unicode_ci = pc.kapt_code COLLATE utf8mb4_unicode_ci
            WHERE ab.latitude IS NOT NULL 
              AND ab.longitude IS NOT NULL
              AND (
                  COALESCE(pc.avg_price_30d, 0) > 0 OR
                  COALESCE(pc.avg_price_90d, 0) > 0 OR
                  COALESCE(pc.avg_price_365d, 0) > 0 OR
                  COALESCE(pc.last_deal_price, 0) > 0 OR
                  COALESCE(pc.is_rental, FALSE) = TRUE
              )
        `;

        const params: (string | number)[] = [];

        // 지역 필터
        if (region) {
            query += ` AND ab.kaptAddr LIKE ?`;
            params.push(`%${region}%`);
        }

        // 동 필터
        if (dong) {
            query += ` AND ab.kaptAddr LIKE ?`;
            params.push(`%${dong}%`);
        }

        // 지도 바운드 필터
        if (swLat && swLng && neLat && neLng) {
            query += ` AND ab.latitude BETWEEN ? AND ?`;
            query += ` AND ab.longitude BETWEEN ? AND ?`;
            params.push(parseFloat(swLat), parseFloat(neLat));
            params.push(parseFloat(swLng), parseFloat(neLng));
        }

        query += ` ORDER BY ab.kaptdaCnt DESC LIMIT ?`;
        params.push(limit);

        const [rows] = await pool.query<ApartmentMapData[]>(query, params);

        // 응답 데이터 변환
        const apartments = rows.map((row: ApartmentMapData) => {
            // 주소에서 구/동 추출
            const addressParts = row.address?.split(' ') || [];
            let gu = '';
            let dongName = '';

            for (let i = 0; i < addressParts.length; i++) {
                const part = addressParts[i];
                if (part.endsWith('구') || part.endsWith('군')) {
                    gu = part;
                } else if (part.endsWith('시') && part.length <= 4 && !part.includes('특별') && !part.includes('광역')) {
                    gu = part;
                }
                if (part.endsWith('동') || part.endsWith('읍') || part.endsWith('면')) {
                    dongName = part;
                    break;
                }
            }

            return {
                id: row.id,
                name: row.name,
                address: row.address,
                lat: row.lat ? parseFloat(String(row.lat)) : 0,
                lng: row.lng ? parseFloat(String(row.lng)) : 0,
                avgPrice: row.avgPrice ? Math.round(Number(row.avgPrice)) : 0,
                pricePeriod: row.pricePeriod || null, // 30, 90, 365 (일)
                householdCount: row.householdCount || 0,
                priceChange: undefined,
                gu,
                dong: dongName,
                isRental: (row as any).isRental === 1 || (row as any).isRental === true,
            };
        });

        return NextResponse.json(apartments);

    } catch (error) {
        console.error('Error fetching apartment map data:', error);
        // 에러 상세 정보 반환 (개발 모드에서만)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                error: 'Failed to fetch apartment data',
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
            },
            { status: 500 }
        );
    }
}
