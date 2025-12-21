/**
 * jibun 데이터 배치 채우기 (고속 버전)
 * 
 * 특징:
 * - 중단 시 이어서 진행 가능 (jibun IS NULL인 것만 처리)
 * - 배치 처리로 효율적
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

const BATCH_SIZE = 1000;

async function main() {
    console.log('=== jibun 데이터 채우기 (배치) ===\n');

    // 현황 확인
    const [stats] = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN jibun IS NOT NULL THEN 1 ELSE 0 END) as filled
        FROM apt_search_index
    `);

    const pending = stats.total - stats.filled;
    console.log(`📊 현황: ${stats.filled.toLocaleString()}/${stats.total.toLocaleString()} (대기: ${pending.toLocaleString()})\n`);

    if (pending === 0) {
        console.log('✅ 이미 완료됨');
        await closeConnection();
        return;
    }

    const startTime = Date.now();
    let processed = 0;
    let updated = 0;

    while (true) {
        // 미처리 항목 가져오기
        const batch = await executeQuery(`
            SELECT id, aptNm, umdNm
            FROM apt_search_index
            WHERE jibun IS NULL
            LIMIT ?
        `, [BATCH_SIZE]);

        if (batch.length === 0) break;

        for (const apt of batch) {
            // 해당 아파트의 가장 많이 쓰인 jibun 찾기
            const [jibunResult] = await executeQuery(`
                SELECT jibun, COUNT(*) as cnt
                FROM apt_deal_info
                WHERE aptNm = ? COLLATE utf8mb4_unicode_ci
                  AND umdNm = ? COLLATE utf8mb4_unicode_ci
                  AND jibun IS NOT NULL AND jibun != ''
                GROUP BY jibun
                ORDER BY cnt DESC
                LIMIT 1
            `, [apt.aptNm, apt.umdNm]);

            if (jibunResult) {
                await executeQuery(`
                    UPDATE apt_search_index SET jibun = ? WHERE id = ?
                `, [jibunResult.jibun, apt.id]);
                updated++;
            } else {
                // jibun이 없는 경우 빈 문자열로 표시 (다시 시도 안하게)
                await executeQuery(`
                    UPDATE apt_search_index SET jibun = '' WHERE id = ?
                `, [apt.id]);
            }
            processed++;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / Math.max(1, elapsed)).toFixed(1);
        const eta = pending > 0 ? ((pending - processed) / Math.max(1, parseFloat(rate)) / 60).toFixed(1) : 0;
        console.log(`   처리: ${processed.toLocaleString()}/${pending.toLocaleString()} | 업데이트: ${updated} | ${rate}/초 | 예상 ${eta}분`);
    }

    // 결과 확인
    const [final] = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN jibun IS NOT NULL AND jibun != '' THEN 1 ELSE 0 END) as has_jibun
        FROM apt_search_index
    `);
    console.log(`\n✅ 완료: ${final.has_jibun.toLocaleString()}/${final.total.toLocaleString()}개에 jibun 설정`);

    await closeConnection();
}

main().catch(e => {
    console.error('오류:', e);
    closeConnection();
    process.exit(1);
});
