/**
 * 이름+동으로 아파트 사이드바 정보 조회 API
 * GET /api/apartments/sidebar?name=아파트명&dong=동이름
 * 
 * kaptCode를 찾은 후 직접 데이터를 조회 (redirect/rewrite 없이)
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

// 카카오 Places API로 주변 학교 검색
async function getSchoolInfo(lat: string | null, lng: string | null) {
    if (!lat || !lng) return null;

    const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY;
    if (!KAKAO_REST_KEY) return null;

    try {
        const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SC4&x=${lng}&y=${lat}&radius=1000&sort=distance`;

        const response = await fetch(url, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const schools = data.documents || [];

        const elementary = schools.find((s: any) => s.place_name.includes('초등학교'));
        const middle = schools.find((s: any) => s.place_name.includes('중학교'));
        const high = schools.find((s: any) => s.place_name.includes('고등학교'));

        const result: any = {};
        if (elementary) result.elementary = { name: elementary.place_name, distance: Math.round(parseFloat(elementary.distance)) };
        if (middle) result.middle = { name: middle.place_name, distance: Math.round(parseFloat(middle.distance)) };
        if (high) result.high = { name: high.place_name, distance: Math.round(parseFloat(high.distance)) };

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const dong = searchParams.get('dong');

    if (!name) {
        return NextResponse.json({ error: 'name parameter is required' }, { status: 400 });
    }

    try {
        // 이름 정규화
        const normalizedName = name.replace(/\s+/g, '');

        // apt_basic_info에서 kaptCode 찾기
        let findQuery = `
            SELECT kaptCode 
            FROM apt_basic_info 
            WHERE REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%')
        `;
        const findParams: string[] = [normalizedName];

        if (dong) {
            findQuery += ` AND kaptAddr LIKE CONCAT('%', ?, '%')`;
            findParams.push(dong);
        }

        findQuery += ` LIMIT 1`;

        const [findRows] = await pool.query<RowDataPacket[]>(findQuery, findParams);

        if (findRows.length === 0) {
            // apt_basic_info에서 못 찾으면 기본 정보만 반환
            return NextResponse.json({
                basic: {
                    id: name,
                    name: name,
                    address: dong ? `${dong}` : '',
                    dongCount: null,
                    parkingRatio: null,
                    buildYear: null,
                    householdCount: null,
                    floors: null,
                },
                priceByArea: [],
                rentPriceByArea: [],
                recentDeals: [],
                recentRents: [],
                schools: null,
                nearby: null,
            });
        }

        const kaptCode = findRows[0].kaptCode;

        // kaptCode로 전체 사이드바 데이터 조회 (기존 [id]/sidebar 로직)
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT 
                ab.kaptCode,
                ab.kaptName as name,
                ab.kaptAddr as address,
                ab.kaptDongCnt as dongCount,
                ab.kaptdEcntp as parkingRatio,
                SUBSTRING(ab.kaptUsedate, 1, 4) as buildYear,
                ab.hoCnt as householdCount,
                ab.kaptTopFloor as floors,
                ab.kaptMarea / NULLIF(ab.hoCnt, 0) as avgArea,
                ab.latitude,
                ab.longitude,
                
                pc.avg_price_30d as price30d,
                pc.avg_price_90d as price90d,
                pc.avg_price_365d as price365d,
                pc.deal_count_30d as dealCount30d,
                pc.last_deal_price as lastDealPrice,
                pc.last_deal_date as lastDealDate,
                
                sc.price_by_area as priceByArea,
                sc.rent_price_by_area as rentPriceByArea,
                sc.recent_deals as recentDeals,
                sc.recent_rents as recentRents,
                sc.price_trend as priceTrend,
                sc.rent_trend as rentTrend
                
            FROM apt_basic_info ab
            LEFT JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            LEFT JOIN apt_sidebar_cache sc ON sc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE ab.kaptCode = ?
        `, [kaptCode]);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Apartment not found' }, { status: 404 });
        }

        const data = rows[0];

        // 평당가 계산
        const avgPrice = data.price365d || data.price90d || data.price30d || 0;
        let avgArea = data.avgArea ? parseFloat(data.avgArea) : 0;

        if (avgArea === 0 && data.priceByArea) {
            try {
                const priceByAreaData = typeof data.priceByArea === 'string'
                    ? JSON.parse(data.priceByArea)
                    : data.priceByArea;
                if (priceByAreaData && priceByAreaData.length > 0) {
                    const mostTraded = priceByAreaData.reduce((max: any, item: any) =>
                        (item.count || 0) > (max.count || 0) ? item : max
                        , priceByAreaData[0]);
                    const areaMatch = mostTraded.area?.match(/(\d+)/);
                    avgArea = areaMatch ? parseFloat(areaMatch[1]) : 0;
                }
            } catch { /* ignore */ }
        }

        const pricePerPyeong = avgArea > 0 ? Math.round(avgPrice / (avgArea / 3.3)) : 0;

        // 주변 시세
        const address = data.address || '';
        const areaMatch = address.match(/(\S+(?:동|읍|면|리))(?:\s|\d|$)/);
        const adminArea = areaMatch ? areaMatch[1] : '';

        let nearby: { id: string; name: string; householdCount: number; avgPrice: number; pricePerPyeong: number }[] = [];
        if (adminArea && data.householdCount) {
            const minHousehold = Math.floor(data.householdCount * 0.3);
            const maxHousehold = Math.ceil(data.householdCount * 3);

            const [nearbyRows] = await pool.query<RowDataPacket[]>(`
                SELECT 
                    ab.kaptCode as id,
                    ab.kaptName as name,
                    ab.hoCnt as householdCount,
                    pc.avg_price_365d as avgPrice,
                    ab.kaptMarea / NULLIF(ab.hoCnt, 0) as avgArea
                FROM apt_basic_info ab
                LEFT JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
                WHERE ab.kaptAddr LIKE ?
                  AND ab.hoCnt BETWEEN ? AND ?
                  AND ab.kaptCode != ?
                  AND pc.avg_price_365d > 0
                ORDER BY pc.avg_price_365d DESC
                LIMIT 5
            `, [`%${adminArea}%`, minHousehold, maxHousehold, kaptCode]);

            nearby = nearbyRows.map(row => {
                const nearbyAvgArea = row.avgArea ? parseFloat(row.avgArea) : avgArea;
                return {
                    id: row.id,
                    name: row.name,
                    householdCount: row.householdCount,
                    avgPrice: row.avgPrice,
                    pricePerPyeong: nearbyAvgArea > 0 ? Math.round(row.avgPrice / (nearbyAvgArea / 3.3)) : 0
                };
            });
        }

        // JSON 필드 파싱
        const parseJsonField = (field: any) => {
            if (!field) return [];
            if (typeof field === 'string') {
                try { return JSON.parse(field); } catch { return []; }
            }
            return field;
        };

        // 응답 구성
        const response = {
            basic: {
                id: data.kaptCode,
                name: data.name,
                address: data.address,
                householdCount: data.householdCount,
                dongCount: data.dongCount,
                parkingRatio: data.parkingRatio,
                buildYear: data.buildYear,
                floors: data.floors,
                avgArea: avgArea,
            },
            price: {
                avgPrice,
                pricePerPyeong,
                price30d: data.price30d || 0,
                price90d: data.price90d || 0,
                price365d: data.price365d || 0,
                dealCount30d: data.dealCount30d || 0,
                lastDealPrice: data.lastDealPrice || 0,
                lastDealDate: data.lastDealDate,
            },
            priceByArea: parseJsonField(data.priceByArea),
            rentPriceByArea: parseJsonField(data.rentPriceByArea),
            recentDeals: parseJsonField(data.recentDeals),
            recentRents: parseJsonField(data.recentRents),
            priceTrend: parseJsonField(data.priceTrend),
            rentTrend: parseJsonField(data.rentTrend),
            nearby,
            school: await getSchoolInfo(data.latitude, data.longitude),
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('Sidebar API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
