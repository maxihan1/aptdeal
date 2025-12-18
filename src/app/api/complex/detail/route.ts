
import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

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

    // Living Info
    subwayLine: string;
    subwayStation: string;
    kaptdWtimebus: string; // Walk to bus
    kaptdWtimesub: string; // Walk to subway

    // School Info
    educationFacility: string;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const aptName = searchParams.get('aptName');
        const region = searchParams.get('region');
        const jibun = searchParams.get('jibun');

        if (!aptName) {
            return NextResponse.json({ error: 'aptName is required' }, { status: 400 });
        }

        // Extract Sigungu and Dong
        // Region format example: "경기도 평택시 이충동", "서울특별시 강남구 삼성동"
        const regionParts = region ? region.split(' ') : [];
        const dong = regionParts.length > 0 ? regionParts[regionParts.length - 1] : '';
        const sigungu = regionParts.length > 1 ? regionParts[regionParts.length - 2] : '';
        const sido = regionParts.length > 2 ? regionParts[0] : '';

        // 1. Try mapping table first (most accurate)
        const mappingQuery = `
            SELECT m.kapt_code, b.kaptName, b.kaptdaCnt, b.kaptDongCnt, b.kaptUsedate, b.kaptBcompany,
                   b.codeHeatNm, b.codeHallNm,
                   COALESCE(d.kaptdPcnt, 0) + COALESCE(d.kaptdPcntu, 0) as kaptdEcntp,
                   COALESCE(d.kaptdPcnt, 0) as kaptdPcnt,
                   COALESCE(d.kaptdPcntu, 0) as kaptdPcntu,
                   d.subwayLine, d.subwayStation, d.kaptdWtimebus, d.kaptdWtimesub, d.educationFacility
            FROM apt_name_mapping m
            JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
            LEFT JOIN apt_detail_info d ON b.kaptCode = d.kaptCode
            WHERE m.deal_apt_name = ? COLLATE utf8mb4_unicode_ci 
              AND m.umd_nm = ? COLLATE utf8mb4_unicode_ci
            ORDER BY m.confidence_score DESC
            LIMIT 1
        `;

        const mappingResult = await executeQuery(mappingQuery, [aptName, dong]) as any[];

        if (mappingResult.length > 0) {
            // Mapping found - return directly
            const row = mappingResult[0];
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
                subwayLine: row.subwayLine,
                subwayStation: row.subwayStation,
                kaptdWtimebus: row.kaptdWtimebus,
                kaptdWtimesub: row.kaptdWtimesub,
                educationFacility: row.educationFacility
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
        d.educationFacility
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

        const rows = await executeQuery(query, params) as any[];

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Complex details not found' }, { status: 404 });
        }

        const row = rows[0];
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
            subwayLine: row.subwayLine,
            subwayStation: row.subwayStation,
            kaptdWtimebus: row.kaptdWtimebus,
            kaptdWtimesub: row.kaptdWtimesub,
            educationFacility: row.educationFacility
        };

        return NextResponse.json(detail);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
