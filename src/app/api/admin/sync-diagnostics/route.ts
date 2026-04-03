/**
 * 동기화 진단 API
 * GET /api/admin/sync-diagnostics
 * 
 * 누락 원인을 분석하여 미매핑, 좌표 부재, 캐시 부재 단지 수를 반환합니다.
 * 인증: ADMIN_KEY 환경변수 설정 시 x-admin-key 헤더 또는 key 쿼리 파라미터 필요
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    // 간단한 인증 (선택)
    const adminKey = request.headers.get('x-admin-key') || request.nextUrl.searchParams.get('key');
    if (process.env.ADMIN_KEY && adminKey !== process.env.ADMIN_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. 미매핑 단지 수 + 거래 건수
        const [unmappedRows] = await pool.query<RowDataPacket[]>(`
            SELECT 
                COUNT(DISTINCT CONCAT(d.aptNm, '__', d.sggCd, '__', d.umdNm)) as unmapped_count,
                COUNT(*) as unmapped_deals,
                COUNT(DISTINCT d.sggCd) as affected_regions
            FROM apt_deal_info d
            LEFT JOIN apt_name_mapping m ON 
                d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND d.sggCd = m.sgg_cd
                AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            WHERE m.id IS NULL 
              AND d.aptNm IS NOT NULL AND d.aptNm != ''
        `);

        // 2. 좌표 없는 단지 수
        const [missingCoordsRows] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as count
            FROM apt_basic_info
            WHERE (latitude IS NULL OR longitude IS NULL)
              AND kaptAddr IS NOT NULL AND kaptAddr != ''
        `);

        // 3. 가격 캐시 없는 단지 수 (매핑은 있지만 캐시가 없는 경우)
        const [missingCacheRows] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as count
            FROM apt_basic_info b
            WHERE b.latitude IS NOT NULL 
              AND b.longitude IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM apt_price_cache pc 
                  WHERE pc.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
                    AND (pc.avg_price_365d > 0 OR pc.last_deal_price > 0 OR pc.rent_avg_price > 0)
              )
        `);

        // 4. 총 매핑 통계
        const [mappingStatsRows] = await pool.query<RowDataPacket[]>(`
            SELECT 
                COUNT(*) as total_mappings,
                SUM(CASE WHEN confidence_score >= 0.95 THEN 1 ELSE 0 END) as high_confidence,
                SUM(CASE WHEN confidence_score >= 0.8 AND confidence_score < 0.95 THEN 1 ELSE 0 END) as medium_confidence,
                SUM(CASE WHEN confidence_score < 0.8 THEN 1 ELSE 0 END) as low_confidence,
                COUNT(DISTINCT mapping_type) as mapping_types
            FROM apt_name_mapping
        `);

        // 5. 지역별 누락 TOP 10
        const [regionDistRows] = await pool.query<RowDataPacket[]>(`
            SELECT 
                d.sggCd,
                d.umdNm,
                COUNT(DISTINCT d.aptNm) as unmapped_count,
                COUNT(*) as unmapped_deals
            FROM apt_deal_info d
            LEFT JOIN apt_name_mapping m ON 
                d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND d.sggCd = m.sgg_cd
                AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            WHERE m.id IS NULL 
              AND d.aptNm IS NOT NULL AND d.aptNm != ''
            GROUP BY d.sggCd, d.umdNm
            ORDER BY unmapped_deals DESC
            LIMIT 10
        `);

        // 6. 지도에 표시되는 총 단지 수
        const [displayedRows] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as count
            FROM apt_basic_info ab
            LEFT JOIN apt_price_cache pc ON ab.kaptCode COLLATE utf8mb4_unicode_ci = pc.kapt_code COLLATE utf8mb4_unicode_ci
            WHERE ab.latitude IS NOT NULL 
              AND ab.longitude IS NOT NULL
              AND (
                  COALESCE(pc.avg_price_30d, 0) > 0 OR
                  COALESCE(pc.avg_price_90d, 0) > 0 OR
                  COALESCE(pc.avg_price_365d, 0) > 0 OR
                  COALESCE(pc.last_deal_price, 0) > 0 OR
                  COALESCE(pc.rent_avg_price, 0) > 0
              )
        `);

        // 7. 마지막 동기화 시간 확인
        const [lastSyncRows] = await pool.query<RowDataPacket[]>(`
            SELECT MAX(updated_at) as last_sync
            FROM apt_price_cache
        `);

        const unmapped = unmappedRows[0];
        const mappingStats = mappingStatsRows[0];

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            
            // 전체 요약
            summary: {
                displayed_on_map: displayedRows[0].count,
                total_mappings: mappingStats.total_mappings,
                unmapped_complexes: unmapped.unmapped_count,
                unmapped_deals: unmapped.unmapped_deals,
                missing_coordinates: missingCoordsRows[0].count,
                missing_price_cache: missingCacheRows[0].count,
                last_cache_update: lastSyncRows[0]?.last_sync || null,
            },

            // 매핑 품질
            mapping_quality: {
                high_confidence: mappingStats.high_confidence,
                medium_confidence: mappingStats.medium_confidence,
                low_confidence: mappingStats.low_confidence,
            },

            // 지역별 누락 TOP 10
            top_unmapped_regions: regionDistRows.map((r: RowDataPacket) => ({
                sggCd: r.sggCd,
                umdNm: r.umdNm,
                unmapped_count: r.unmapped_count,
                unmapped_deals: r.unmapped_deals,
            })),

            // 영향도 평가
            health: {
                mapping_coverage_pct: mappingStats.total_mappings > 0 
                    ? Math.round((1 - unmapped.unmapped_count / (mappingStats.total_mappings + unmapped.unmapped_count)) * 100)
                    : 0,
                coordinate_coverage_pct: missingCoordsRows[0].count === 0 ? 100 
                    : 'requires_basic_info_total_for_calc',
                affected_regions: unmapped.affected_regions,
            }
        });

    } catch (error) {
        console.error('Sync diagnostics error:', error);
        return NextResponse.json(
            { error: 'Failed to run diagnostics', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
