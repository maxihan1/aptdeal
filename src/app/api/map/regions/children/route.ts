/**
 * 지역 하위 정보 API
 * GET /api/map/regions/[type]/children
 * 
 * - sido 클릭: 해당 시도의 시군구 목록
 * - sigungu 클릭: 해당 시군구의 읍면동 목록
 * - dong 클릭: 해당 동의 아파트 목록
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // sido, sigungu, dong
    const name = searchParams.get('name'); // 지역 이름
    const parent = searchParams.get('parent'); // 상위 지역 (시군구/동의 경우)

    // 지도 영역 필터링용 bounds
    const swLat = searchParams.get('swLat');
    const swLng = searchParams.get('swLng');
    const neLat = searchParams.get('neLat');
    const neLng = searchParams.get('neLng');
    const hasBounds = swLat && swLng && neLat && neLng;

    if (!type || !name) {
        return NextResponse.json({ error: 'Missing type or name' }, { status: 400 });
    }

    try {
        let result;

        if (type === 'sido') {
            // 시도 클릭 → 시군구 목록 반환
            const [rows] = await pool.query<RowDataPacket[]>(`
                SELECT 
                    rc.region_name as name,
                    rc.center_lat as lat,
                    rc.center_lng as lng,
                    rc.apartment_count as apartmentCount,
                    rc.avg_price_365d as avgPrice
                FROM region_price_cache rc
                WHERE rc.region_type = 'sigungu'
                  AND rc.parent_name = ?
                ORDER BY rc.apartment_count DESC
            `, [name]);

            result = {
                type: 'sigungu',
                parentName: name,
                children: rows,
                totalCount: rows.length,
                totalApartments: rows.reduce((sum, r) => sum + (r.apartmentCount || 0), 0),
            };
        }
        else if (type === 'sigungu') {
            // 시군구 클릭 → 읍면동 목록 반환
            const parentName = parent ? `${parent} ${name}` : name;

            const [rows] = await pool.query<RowDataPacket[]>(`
                SELECT 
                    rc.region_name as name,
                    rc.center_lat as lat,
                    rc.center_lng as lng,
                    rc.apartment_count as apartmentCount,
                    rc.avg_price_365d as avgPrice
                FROM region_price_cache rc
                WHERE rc.region_type = 'dong'
                  AND rc.parent_name = ?
                ORDER BY rc.apartment_count DESC
            `, [parentName]);

            result = {
                type: 'dong',
                parentName: parentName,
                children: rows,
                totalCount: rows.length,
                totalApartments: rows.reduce((sum, r) => sum + (r.apartmentCount || 0), 0),
            };
        }
        else if (type === 'dong') {
            // 읍면동 클릭 → 아파트 목록 반환
            const fullAddr = parent ? `${parent} ${name}` : name;

            // bounds가 있으면 현재 화면 영역으로 필터링
            let boundsCondition = '';
            const params: (string | number)[] = [`%${fullAddr}%`];

            if (hasBounds) {
                boundsCondition = `
                  AND ab.latitude BETWEEN ? AND ?
                  AND ab.longitude BETWEEN ? AND ?
                `;
                params.push(Number(swLat), Number(neLat), Number(swLng), Number(neLng));
            }

            const [rows] = await pool.query<RowDataPacket[]>(`
                SELECT 
                    ab.kaptCode as id,
                    COALESCE(si.displayName, ab.kaptName) as name,
                    ab.kaptAddr as address,
                    ab.hoCnt as householdCount,
                    ab.kaptDongCnt as dongCount,
                    SUBSTRING(ab.kaptUsedate, 1, 4) as buildYear,
                    ab.latitude as lat,
                    ab.longitude as lng,
                    COALESCE(pc.avg_price_90d, pc.avg_price_365d, pc.last_deal_price) as avgPrice90d,
                    pc.deal_count_30d as dealCount30d,
                    pc.last_deal_price as lastDealPrice
                FROM apt_basic_info ab
                LEFT JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
                LEFT JOIN apt_search_index si ON si.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
                WHERE ab.kaptAddr LIKE ?
                  AND ab.latitude IS NOT NULL
                  ${boundsCondition}
                ORDER BY COALESCE(pc.avg_price_90d, pc.last_deal_price, 0) DESC, ab.hoCnt DESC
                LIMIT 30
            `, params);

            // 전월세 정보는 간략화 (속도 우선)
            const apartmentsWithRent = rows.map(apt => ({
                ...apt,
                avgJeonse: 0, // 상세는 개별 클릭 시 로드
                rentCount: 0,
            }));

            result = {
                type: 'apartments',
                parentName: fullAddr,
                children: apartmentsWithRent,
                totalCount: rows.length,
            };
        }
        else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        return NextResponse.json(result);

    } catch (error) {
        console.error('Error fetching region children:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to fetch data', details: errorMessage },
            { status: 500 }
        );
    }
}
