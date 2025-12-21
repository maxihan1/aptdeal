/**
 * 지도 사이드바용 아파트 상세 정보 API (캐시 버전)
 * GET /api/apartments/[id]/sidebar
 * 
 * apt_sidebar_cache 테이블에서 미리 계산된 데이터를 가져옴
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

interface Params {
    params: Promise<{ id: string }>;
}

// 카카오 Places API로 주변 학교 검색
async function getSchoolInfo(lat: string | null, lng: string | null) {
    if (!lat || !lng) return null;

    const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY;
    if (!KAKAO_REST_KEY) return null;

    try {
        // SC4 = 학교 카테고리 (초중고 포함)
        const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SC4&x=${lng}&y=${lat}&radius=1000&sort=distance`;

        const response = await fetch(url, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        });

        if (!response.ok) return null;

        const data = await response.json();
        const schools = data.documents || [];

        // 학교 종류별로 가장 가까운 것 선택
        const elementary = schools.find((s: any) => s.place_name.includes('초등학교'));
        const middle = schools.find((s: any) => s.place_name.includes('중학교'));
        const high = schools.find((s: any) => s.place_name.includes('고등학교'));

        const result: any = {};
        if (elementary) {
            result.elementary = { name: elementary.place_name, distance: Math.round(parseFloat(elementary.distance)) };
        }
        if (middle) {
            result.middle = { name: middle.place_name, distance: Math.round(parseFloat(middle.distance)) };
        }
        if (high) {
            result.high = { name: high.place_name, distance: Math.round(parseFloat(high.distance)) };
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
        console.error('Failed to fetch school info:', error);
        return null;
    }
}

export async function GET(request: NextRequest, { params }: Params) {
    const { id: kaptCode } = await params;

    if (!kaptCode) {
        return NextResponse.json({ error: 'Missing apartment ID' }, { status: 400 });
    }

    try {
        // 1. 기본 정보 + 가격 캐시 + 사이드바 캐시를 한번에 조회
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
                ab.kaptMarea / NULLIF(ab.hoCnt, 0) as avgArea,  -- 전용면적 합계 / 세대수 = 평균 전용면적
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

        // avgArea가 없으면 priceByArea에서 가장 거래가 많은 면적 사용
        if (avgArea === 0 && data.priceByArea) {
            try {
                const priceByAreaData = typeof data.priceByArea === 'string'
                    ? JSON.parse(data.priceByArea)
                    : data.priceByArea;
                if (priceByAreaData && priceByAreaData.length > 0) {
                    // 거래 건수가 가장 많은 면적 선택
                    const mostTraded = priceByAreaData.reduce((max: any, item: any) =>
                        (item.count || 0) > (max.count || 0) ? item : max
                        , priceByAreaData[0]);
                    // 면적 문자열에서 숫자 추출 (예: "84㎡" -> 84)
                    const areaMatch = mostTraded.area?.match(/(\d+)/);
                    avgArea = areaMatch ? parseFloat(areaMatch[1]) : 0;
                }
            } catch { /* ignore parse errors */ }
        }

        const pricePerPyeong = avgArea > 0 ? Math.round(avgPrice / (avgArea / 3.3)) : 0;

        // 주변 시세 - 동/읍/면/리 모두 처리 (평당가 비교)
        const address = data.address || '';
        // 주소에서 행정구역(동/읍/면/리) 추출 - 공백이 뒤에 있거나 숫자가 뒤따르는 경우 모두 처리
        const areaMatch = address.match(/(\S+(?:동|읍|면|리))(?:\s|\d|$)/);
        const adminArea = areaMatch ? areaMatch[1] : '';

        let nearby: { id: string; name: string; householdCount: number; avgPrice: number; pricePerPyeong: number }[] = [];
        if (adminArea && data.householdCount) {
            // 세대수 범위를 더 넓게 (0.3배 ~ 3배)
            const minHousehold = Math.max(100, Math.floor(data.householdCount * 0.3));
            const maxHousehold = data.householdCount * 3;

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
                  AND ab.kaptCode != ? 
                  AND ab.hoCnt BETWEEN ? AND ?
                  AND pc.avg_price_365d > 0
                ORDER BY pc.avg_price_365d DESC
                LIMIT 5
            `, [`%${adminArea}%`, kaptCode, minHousehold, maxHousehold]);
            nearby = nearbyRows.map(r => {
                const nearbyAvgArea = r.avgArea ? parseFloat(String(r.avgArea)) : 0;
                const nearbyPricePerPyeong = nearbyAvgArea > 0 ? Math.round(r.avgPrice / (nearbyAvgArea / 3.3)) : 0;
                return {
                    id: r.id,
                    name: r.name,
                    householdCount: r.householdCount,
                    avgPrice: r.avgPrice,
                    pricePerPyeong: nearbyPricePerPyeong,
                };
            });
        }

        // JSON 필드 파싱 (문자열인 경우)
        const parseJsonField = (field: unknown) => {
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
        console.error('Error fetching sidebar data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to fetch data', details: errorMessage },
            { status: 500 }
        );
    }
}
