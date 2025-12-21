/**
 * 미매핑 아파트에 대한 2차 매핑 (더 느슨한 조건)
 * 
 * 1차 매핑에서 놓친 것들을 추가로 매핑
 * - 동 + 지번만으로 매칭 (아파트명 무시)
 * - K-apt 주소에서 지번 패턴 검색
 * 
 * 사용법:
 *   node src/scripts/data-loader/14_remap_unmapped.js
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

const BATCH_SIZE = 500;

async function main() {
    console.log('=== 미매핑 아파트 2차 매핑 ===\n');

    // 미매핑 현황
    const [stats] = await executeQuery(`
        SELECT COUNT(*) as cnt FROM apt_search_index WHERE kapt_code = 'UNMAPPED'
    `);
    console.log(`미매핑 아파트: ${stats.cnt.toLocaleString()}\n`);

    if (stats.cnt === 0) {
        console.log('✅ 미매핑 없음');
        await closeConnection();
        return;
    }

    const startTime = Date.now();
    let processed = 0;
    let remapped = 0;

    while (true) {
        // 미매핑 항목 가져오기
        const batch = await executeQuery(`
            SELECT id, aptNm, umdNm, jibun, sggCd
            FROM apt_search_index
            WHERE kapt_code = 'UNMAPPED'
              AND jibun IS NOT NULL AND jibun != ''
            LIMIT ?
        `, [BATCH_SIZE]);

        if (batch.length === 0) break;

        for (const apt of batch) {
            const result = await tryRematch(apt);

            if (result.kaptCode) {
                await executeQuery(`
                    UPDATE apt_search_index SET kapt_code = ? WHERE id = ?
                `, [result.kaptCode, apt.id]);
                remapped++;
            }
            processed++;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / Math.max(1, elapsed)).toFixed(1);
        console.log(`   처리: ${processed.toLocaleString()} | 재매핑: ${remapped} | ${rate}/초`);
    }

    console.log(`\n=== 완료 ===`);
    console.log(`총 처리: ${processed.toLocaleString()}`);
    console.log(`재매핑 성공: ${remapped.toLocaleString()} (${(remapped * 100 / Math.max(1, processed)).toFixed(1)}%)`);

    // 최종 현황
    const [final] = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN kapt_code IS NOT NULL AND kapt_code != 'UNMAPPED' THEN 1 ELSE 0 END) as mapped
        FROM apt_search_index
    `);
    console.log(`\n📊 최종: ${final.mapped.toLocaleString()}/${final.total.toLocaleString()} 매핑됨 (${(final.mapped * 100 / final.total).toFixed(1)}%)`);

    await closeConnection();
}

/**
 * 더 느슨한 조건으로 재매칭 시도
 */
async function tryRematch(apt) {
    const { umdNm, jibun, sggCd } = apt;

    if (!jibun) return { kaptCode: null };

    // 지번에서 메인 번호와 서브 번호 추출
    const jibunParts = jibun.split('-');
    const jibunMain = jibunParts[0].trim();

    // 1. K-apt 주소에서 동 + 지번 메인번호가 포함된 것 찾기
    // 예: "서초동 1617" 패턴
    const candidates = await executeQuery(`
        SELECT kaptCode, kaptName, kaptAddr, kaptdaCnt
        FROM apt_basic_info
        WHERE kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
          AND (
            kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, ' %')
            OR kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '-', '%')
            OR kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('% ', ?, ' %')
          )
        ORDER BY kaptdaCnt DESC
        LIMIT 3
    `, [umdNm, jibunMain, jibunMain, jibunMain]);

    if (candidates.length === 1) {
        return { kaptCode: candidates[0].kaptCode };
    }

    if (candidates.length > 1) {
        // 세대수 가장 많은 것 선택
        return { kaptCode: candidates[0].kaptCode };
    }

    // 2. 동만으로 1개만 있으면 매칭 (소규모 동네)
    const dongOnly = await executeQuery(`
        SELECT kaptCode, kaptName
        FROM apt_basic_info
        WHERE kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
    `, [umdNm]);

    if (dongOnly.length === 1) {
        return { kaptCode: dongOnly[0].kaptCode };
    }

    return { kaptCode: null };
}

main().catch(e => {
    console.error('오류:', e);
    closeConnection();
    process.exit(1);
});
