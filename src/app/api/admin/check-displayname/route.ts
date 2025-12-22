import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET() {
    try {
        // 1. apt_search_index에서 displayName 통계
        const [stats] = await pool.query<RowDataPacket[]>(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN displayName IS NULL THEN 1 ELSE 0 END) as nullCount,
                SUM(CASE WHEN displayName = aptNm THEN 1 ELSE 0 END) as sameAsAptNm,
                SUM(CASE WHEN displayName LIKE '%아파트%' THEN 1 ELSE 0 END) as containsApartment
            FROM apt_search_index
        `);

        // 2. apt_basic_info에 있지만 apt_search_index에 없는 아파트 (가격 있는 것)
        const [notInSearch] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as cnt
            FROM apt_basic_info ab
            LEFT JOIN apt_search_index si ON si.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            INNER JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.id IS NULL
        `);

        // 3. displayName과 kaptName이 다른 예시 (정상 업데이트된 케이스)
        const [updatedSamples] = await pool.query<RowDataPacket[]>(`
            SELECT ab.kaptCode, ab.kaptName, si.displayName
            FROM apt_basic_info ab
            JOIN apt_search_index si ON si.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.displayName IS NOT NULL 
              AND si.displayName COLLATE utf8mb4_unicode_ci != ab.kaptName COLLATE utf8mb4_unicode_ci
            LIMIT 10
        `);

        // 4. displayName NULL이고 가격 정보 있는 아파트 샘플
        const [nullSamples] = await pool.query<RowDataPacket[]>(`
            SELECT ab.kaptCode, ab.kaptName, ab.kaptAddr, pc.deal_count_30d as recentDeals
            FROM apt_basic_info ab
            JOIN apt_search_index si ON si.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.displayName IS NULL
            ORDER BY pc.deal_count_30d DESC
            LIMIT 20
        `);

        return NextResponse.json({
            summary: {
                total: stats[0].total,
                nullDisplayName: stats[0].nullCount,
                sameAsAptNm: stats[0].sameAsAptNm,
                containsApartment: stats[0].containsApartment,
                notInSearchIndex: notInSearch[0].cnt,
            },
            updatedSamples,
            nullSamples,
        });
    } catch (error) {
        console.error('Error checking displayName:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        return NextResponse.json({ error: 'Failed to check', details: errMsg }, { status: 500 });
    }
}
