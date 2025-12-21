
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

interface ComplexDetail {
    // Basic Info
    kaptName: string;
    kaptdaCnt: number; // Total households
    kaptDongCnt: number; // Total blocks
    kaptUsedate: string; // Approval date
    kaptBcompany: string; // Constructor
    codeHeatNm: string; // Heating
    codeHallNm: string; // Hallway type
    kaptdEcntp: number; // Total parking (ground + underground)
    kaptdPcnt: number; // Ground parking
    kaptdPcntu: number; // Underground parking

    // Living Info (from Kakao API)
    subwayLine: string;
    subwayStation: string;
    subwayDistance?: number;
    busStopName?: string;
    busStopDistance?: number;
    kaptdWtimebus: string; // Walk to bus (legacy)
    kaptdWtimesub: string; // Walk to subway (legacy)

    // School Info (from Kakao API)
    educationFacility: string;
    schoolInfo?: {
        elementary?: { name: string; distance: number };
        middle?: { name: string; distance: number };
        high?: { name: string; distance: number };
    };
}

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

// 카카오 Places API로 주변 교통 정보 검색 (지하철, 버스)
async function getTransportInfo(lat: string | null, lng: string | null) {
    if (!lat || !lng) return null;

    const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY;
    if (!KAKAO_REST_KEY) return null;

    try {
        // 지하철역 검색 (SW8)
        const subwayUrl = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&x=${lng}&y=${lat}&radius=1500&sort=distance`;
        const subwayRes = await fetch(subwayUrl, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        });

        // 버스정류장 검색 (BK9 대신 키워드 검색 사용)
        const busUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=버스정류장&x=${lng}&y=${lat}&radius=500&sort=distance`;
        const busRes = await fetch(busUrl, {
            headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        });

        const result: any = {};

        if (subwayRes.ok) {
            const subwayData = await subwayRes.json();
            const subway = subwayData.documents?.[0];
            if (subway) {
                result.subwayStation = subway.place_name;
                result.subwayDistance = Math.round(parseFloat(subway.distance));
                // 노선 정보 추출 (예: "강남역 2호선" -> "2호선")
                const lineMatch = subway.place_name.match(/(\d+호선|[가-힣]+선)/);
                result.subwayLine = lineMatch ? lineMatch[0] : '';
            }
        }

        if (busRes.ok) {
            const busData = await busRes.json();
            const bus = busData.documents?.[0];
            if (bus) {
                result.busStopName = bus.place_name;
                result.busStopDistance = Math.round(parseFloat(bus.distance));
            }
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const aptName = searchParams.get('aptName');
        const region = searchParams.get('region');
        const jibun = searchParams.get('jibun');
        const kaptCode = searchParams.get('kaptCode'); // 주소 기반 매핑에서 직접 전달

        // kaptCode가 있으면 바로 조회 (가장 정확)
        if (kaptCode && kaptCode !== 'UNMAPPED') {
            // 단지 번호가 붙은 경우 기본 코드 추출 (예: A12175203_1 → A12175203)
            const baseKaptCode = kaptCode.includes('_') ? kaptCode.split('_')[0] : kaptCode;

            const directQuery = `
                SELECT b.kaptName, b.kaptdaCnt, b.kaptDongCnt, b.kaptUsedate, b.kaptBcompany,
                       b.codeHeatNm, b.codeHallNm,
                       COALESCE(d.kaptdPcnt, 0) + COALESCE(d.kaptdPcntu, 0) as kaptdEcntp,
                       COALESCE(d.kaptdPcnt, 0) as kaptdPcnt,
                       COALESCE(d.kaptdPcntu, 0) as kaptdPcntu,
                       d.subwayLine, d.subwayStation, d.kaptdWtimebus, d.kaptdWtimesub, d.educationFacility,
                       b.latitude, b.longitude
                FROM apt_basic_info b
                LEFT JOIN apt_detail_info d ON b.kaptCode = d.kaptCode
                WHERE b.kaptCode = ?
                LIMIT 1
            `;
            const [directResult] = await pool.query<RowDataPacket[]>(directQuery, [baseKaptCode]);
            if (directResult.length > 0) {
                const row = directResult[0];

                // 카카오 API로 학교/교통 정보 가져오기
                const [schoolInfo, transportInfo] = await Promise.all([
                    getSchoolInfo(row.latitude, row.longitude),
                    getTransportInfo(row.latitude, row.longitude)
                ]);

                const detail: ComplexDetail = {
                    kaptName: row.kaptName,
                    kaptdaCnt: row.kaptdaCnt,
                    kaptDongCnt: row.kaptDongCnt,
                    kaptUsedate: row.kaptUsedate,
                    kaptBcompany: row.kaptBcompany,
                    codeHeatNm: row.codeHeatNm,
                    codeHallNm: row.codeHallNm,
                    kaptdEcntp: row.kaptdEcntp,
                    kaptdPcnt: row.kaptdPcnt,
                    kaptdPcntu: row.kaptdPcntu,
                    // 카카오 API 결과 우선, 없으면 DB 값 사용
                    subwayLine: transportInfo?.subwayLine || row.subwayLine || '',
                    subwayStation: transportInfo?.subwayStation || row.subwayStation || '',
                    subwayDistance: transportInfo?.subwayDistance,
                    busStopName: transportInfo?.busStopName,
                    busStopDistance: transportInfo?.busStopDistance,
                    kaptdWtimebus: row.kaptdWtimebus,
                    kaptdWtimesub: row.kaptdWtimesub,
                    educationFacility: row.educationFacility,
                    schoolInfo
                };
                return NextResponse.json(detail);
            }
        }

        if (!aptName) {
            return NextResponse.json({ error: 'aptName is required' }, { status: 400 });
        }

        // Extract Sigungu and Dong
        // Region format example: "경기도 평택시 이충동", "서울특별시 강남구 삼성동"
        // Or with only sigungu: "경기도 부천소사구"
        const regionParts = region ? region.split(' ') : [];

        // Check if last part is dong (ends with 동/읍/면/리) or sigungu (ends with 시/구/군)
        const lastPart = regionParts.length > 0 ? regionParts[regionParts.length - 1] : '';
        const isDongPattern = /동$|읍$|면$|리$/.test(lastPart);

        let dong = '';
        let sigungu = '';
        let sido = '';

        if (isDongPattern) {
            // Standard: sido sigungu dong (e.g., "경기도 평택시 이충동")
            dong = lastPart;
            sigungu = regionParts.length > 1 ? regionParts[regionParts.length - 2] : '';
            sido = regionParts.length > 2 ? regionParts[0] : '';
        } else {
            // No dong: sido sigungu (e.g., "경기도 부천소사구")
            dong = '';
            sigungu = lastPart;
            sido = regionParts.length > 1 ? regionParts[0] : '';
        }

        // 1. Try mapping table first (most accurate)
        const mappingQuery = `
            SELECT m.kapt_code, b.kaptName, b.kaptdaCnt, b.kaptDongCnt, b.kaptUsedate, b.kaptBcompany,
                   b.codeHeatNm, b.codeHallNm,
                   COALESCE(d.kaptdPcnt, 0) + COALESCE(d.kaptdPcntu, 0) as kaptdEcntp,
                   COALESCE(d.kaptdPcnt, 0) as kaptdPcnt,
                   COALESCE(d.kaptdPcntu, 0) as kaptdPcntu,
                   d.subwayLine, d.subwayStation, d.kaptdWtimebus, d.kaptdWtimesub, d.educationFacility,
                   b.latitude, b.longitude
            FROM apt_name_mapping m
            JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
            LEFT JOIN apt_detail_info d ON b.kaptCode = d.kaptCode
            WHERE m.deal_apt_name = ? COLLATE utf8mb4_unicode_ci 
              AND m.umd_nm = ? COLLATE utf8mb4_unicode_ci
            ORDER BY m.confidence_score DESC
            LIMIT 1
        `;

        const [mappingResult] = await pool.query<RowDataPacket[]>(mappingQuery, [aptName, dong]);

        if (mappingResult.length > 0) {
            // Mapping found - return directly
            const row = mappingResult[0];

            // 카카오 API로 학교/교통 정보 가져오기
            const [schoolInfo, transportInfo] = await Promise.all([
                getSchoolInfo(row.latitude, row.longitude),
                getTransportInfo(row.latitude, row.longitude)
            ]);

            const detail: ComplexDetail = {
                kaptName: row.kaptName,
                kaptdaCnt: row.kaptdaCnt,
                kaptDongCnt: row.kaptDongCnt,
                kaptUsedate: row.kaptUsedate,
                kaptBcompany: row.kaptBcompany,
                codeHeatNm: row.codeHeatNm,
                codeHallNm: row.codeHallNm,
                kaptdEcntp: row.kaptdEcntp,
                kaptdPcnt: row.kaptdPcnt,
                kaptdPcntu: row.kaptdPcntu,
                subwayLine: transportInfo?.subwayLine || row.subwayLine || '',
                subwayStation: transportInfo?.subwayStation || row.subwayStation || '',
                subwayDistance: transportInfo?.subwayDistance,
                busStopName: transportInfo?.busStopName,
                busStopDistance: transportInfo?.busStopDistance,
                kaptdWtimebus: row.kaptdWtimebus,
                kaptdWtimesub: row.kaptdWtimesub,
                educationFacility: row.educationFacility,
                schoolInfo
            };
            return NextResponse.json(detail);
        }

        // 2. Fallback to dynamic matching
        // Normalize names for comparison (remove spaces)
        // cleanAptName: remove content in parentheses
        const cleanAptName = aptName.replace(/\([^)]*\)/g, '').trim();
        const noSpaceAptName = aptName.replace(/\s+/g, '');
        const noSpaceCleanAptName = cleanAptName.replace(/\s+/g, '');

        // Extract "N단지" pattern (e.g., "12단지", "11단지")
        const danjiMatch = aptName.match(/(\d+단지)/);
        const danjiPattern = danjiMatch ? danjiMatch[1] : '';

        // Improved Query Strategy (Enhanced Existing Logic):
        // We maintain the strict priority order (1, 2, 3...) but add Sigungu matching as a higher priority condition.
        // We also use REPLACE(..., ' ', '') for robust name comparison.

        const query = `
      SELECT 
        b.kaptName,
        b.kaptdaCnt,
        b.kaptDongCnt,
        b.kaptUsedate,
        b.kaptBcompany,
        b.codeHeatNm,
        b.codeHallNm,
        COALESCE(d.kaptdPcnt, 0) + COALESCE(d.kaptdPcntu, 0) as kaptdEcntp,
        COALESCE(d.kaptdPcnt, 0) as kaptdPcnt,
        COALESCE(d.kaptdPcntu, 0) as kaptdPcntu,
        d.subwayLine,
        d.subwayStation,
        d.kaptdWtimebus,
        d.kaptdWtimesub,
        d.educationFacility,
        b.latitude,
        b.longitude
      FROM apt_basic_info b
      LEFT JOIN apt_detail_info d ON b.kaptCode = d.kaptCode
      WHERE 
         -- REQUIRED: Sigungu must match (prevents wrong region matches like 안산 현대 vs 구로 현대)
         (? = 'xxxx' OR b.kaptAddr LIKE CONCAT('%', ?, '%'))
         AND
         -- Broad filtering: Match by any of the name variations OR name+address partial match
         (
             REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci
             OR REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci
             OR REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci
             OR REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci
             -- New: Check if DB name is contained in Input Name (handle '2차' case where DB is plain)
             OR ? LIKE CONCAT('%', REPLACE(b.kaptName, ' ', ''), '%') COLLATE utf8mb4_unicode_ci
             OR (b.kaptName LIKE CONCAT('%', ?, '%') AND b.kaptAddr LIKE CONCAT('%', ?, '%'))
             -- New: Address Match (Fallback)
             OR (? != '' AND b.kaptAddr LIKE CONCAT('%', ?, '%') AND b.kaptAddr LIKE CONCAT('%', ?, '%'))
             -- New: Dong + N단지 pattern match (handles word order issues like 판교더샵 vs 더샵판교)
             OR (? != '' AND b.kaptAddr LIKE CONCAT('%', ?, '%') AND b.kaptName LIKE CONCAT('%', ?, '%'))
         )
      ORDER BY
        CASE 
            -- 1. Exact Name Match + Sigungu Match (Best)
            WHEN REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 1
            
            -- 1.5. Dong + AptName partial match (handles 신현동 + 효성 → 신현효성아파트)
            WHEN b.kaptAddr LIKE CONCAT('%', ?, '%') AND b.kaptName LIKE CONCAT('%', ?, '%') THEN 1
            
            -- 2. Exact Name Match (Any Region) - lowered priority due to regional ambiguity
            WHEN REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci THEN 3
            
            -- 2.2. Dong + N단지 pattern match (highest priority for word order issues)
            WHEN ? != '' AND b.kaptAddr LIKE CONCAT('%', ?, '%') AND b.kaptName LIKE CONCAT('%', ?, '%') THEN 2
            
            -- 2.5. Input contains DB Name + Sigungu Match (handles word order: 판교더샵 vs 더샵판교)
            WHEN ? LIKE CONCAT('%', REPLACE(b.kaptName, ' ', ''), '%') COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 3
            
            -- 3. Name + 'Apt' + Sigungu Match
            WHEN REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 4
            
            -- 4. Name + 'Apt' (Any Region)
            WHEN REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci THEN 5
            
            -- 5. Clean Name + Sigungu Match
            WHEN REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 5
            
            -- 6. Clean Name (Any Region)
            WHEN REPLACE(b.kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci THEN 6

            -- 7. Clean Name + 'Apt' + Sigungu Match
            WHEN REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 7

            -- 8. Clean Name + 'Apt' (Any Region)
            WHEN REPLACE(b.kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci THEN 8

            -- 9. Input contains DB Name (Reverse Like) + Sigungu Match
            WHEN ? LIKE CONCAT('%', REPLACE(b.kaptName, ' ', ''), '%') COLLATE utf8mb4_unicode_ci AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 9

            -- 10. Address Match (Dong + Jibun)
            WHEN ? != '' AND b.kaptAddr LIKE CONCAT('%', ?, '%') AND b.kaptAddr LIKE CONCAT('%', ?, '%') THEN 10
            
            -- Fallback
            ELSE 99
        END ASC,
        b.kaptdaCnt DESC  -- Prefer larger complexes when priority is same
      LIMIT 1
    `;

        const params = [
            // WHERE Clause Params
            sigungu || 'xxxx', sigungu || 'xxxx', // REQUIRED: Sigungu filter (new)
            noSpaceAptName,
            noSpaceAptName,
            noSpaceCleanAptName,
            noSpaceCleanAptName,
            noSpaceAptName, // New param for reverse like
            cleanAptName, dong || 'xxxx',
            jibun || '', dong || 'xxxx', jibun || 'xxxx', // Address Match Params
            danjiPattern, dong || 'xxxx', danjiPattern, // Dong + N단지 Match Params (WHERE)

            // ORDER BY Clause Params
            noSpaceAptName, sigungu || 'xxxx',     // 1
            dong || 'xxxx', noSpaceAptName,        // 1.5 (new: Dong + AptName partial)
            noSpaceAptName,                        // 2
            danjiPattern, dong || 'xxxx', danjiPattern, // 2.2 (new: Dong + N단지)
            noSpaceAptName, sigungu || 'xxxx',     // 2.5 (new: Input contains DB Name + Sigungu)
            noSpaceAptName, sigungu || 'xxxx',     // 3
            noSpaceAptName,                        // 4
            noSpaceCleanAptName, sigungu || 'xxxx',// 5
            noSpaceCleanAptName,                   // 6
            noSpaceCleanAptName, sigungu || 'xxxx',// 7
            noSpaceCleanAptName,                   // 8
            noSpaceAptName, sigungu || 'xxxx',     // 9
            jibun || '', dong || 'xxxx', jibun || 'xxxx' // 10
        ];

        const [rows] = await pool.query<RowDataPacket[]>(query, params);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Complex details not found' }, { status: 404 });
        }

        const row = rows[0];

        // 카카오 API로 학교/교통 정보 가져오기
        const [schoolInfo, transportInfo] = await Promise.all([
            getSchoolInfo(row.latitude, row.longitude),
            getTransportInfo(row.latitude, row.longitude)
        ]);

        const detail: ComplexDetail = {
            kaptName: row.kaptName,
            kaptdaCnt: row.kaptdaCnt,
            kaptDongCnt: row.kaptDongCnt,
            kaptUsedate: row.kaptUsedate,
            kaptBcompany: row.kaptBcompany,
            codeHeatNm: row.codeHeatNm,
            codeHallNm: row.codeHallNm,
            kaptdEcntp: row.kaptdEcntp,
            kaptdPcnt: row.kaptdPcnt,
            kaptdPcntu: row.kaptdPcntu,
            subwayLine: transportInfo?.subwayLine || row.subwayLine || '',
            subwayStation: transportInfo?.subwayStation || row.subwayStation || '',
            subwayDistance: transportInfo?.subwayDistance,
            busStopName: transportInfo?.busStopName,
            busStopDistance: transportInfo?.busStopDistance,
            kaptdWtimebus: row.kaptdWtimebus,
            kaptdWtimesub: row.kaptdWtimesub,
            educationFacility: row.educationFacility,
            schoolInfo
        };

        return NextResponse.json(detail);

    } catch (error) {
        console.error('API Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('Error stack:', errorStack);
        return NextResponse.json(
            { error: 'Internal Server Error', details: errorMessage },
            { status: 500 }
        );
    }
}
