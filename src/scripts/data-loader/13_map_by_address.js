/**
 * 주소(jibun) 기반 kaptCode 매핑 스크립트
 * 
 * 특징:
 * - 중단 시 이어서 진행 가능 (kapt_code IS NULL인 것만 처리)
 * - 배치 처리로 메모리 효율적
 * - 신뢰도 기반 매핑 (정확 매칭 vs 유사 매칭)
 * 
 * 사용법:
 *   node src/scripts/data-loader/13_map_by_address.js
 *   node src/scripts/data-loader/13_map_by_address.js --force  # 전체 재매핑
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

const BATCH_SIZE = 500;
const FORCE_REMAP = process.argv.includes('--force');

async function main() {
    console.log('=== 주소 기반 kaptCode 매핑 시작 ===\n');

    if (FORCE_REMAP) {
        console.log('⚠️ --force 모드: 모든 항목 재매핑\n');
        await executeQuery('UPDATE apt_search_index SET kapt_code = NULL');
    }

    // 1. 처리 대상 확인
    const [stats] = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN kapt_code IS NULL AND jibun IS NOT NULL THEN 1 ELSE 0 END) as pending
        FROM apt_search_index
    `);

    console.log(`📊 현황:`);
    console.log(`   총 항목: ${stats.total.toLocaleString()}`);
    console.log(`   매핑 대기: ${stats.pending.toLocaleString()}\n`);

    if (stats.pending === 0) {
        console.log('✅ 매핑 대기 항목이 없습니다.');
        await closeConnection();
        return;
    }

    // 2. 배치 처리
    let processed = 0;
    let matched = 0;
    let multiMatch = 0;
    let noMatch = 0;
    const startTime = Date.now();

    while (true) {
        // 미매핑 항목 가져오기
        const batch = await executeQuery(`
            SELECT id, aptNm, umdNm, sggCd, jibun
            FROM apt_search_index
            WHERE kapt_code IS NULL 
              AND jibun IS NOT NULL AND jibun != ''
            LIMIT ?
        `, [BATCH_SIZE]);

        if (batch.length === 0) break;

        for (const apt of batch) {
            const result = await matchKaptCode(apt);

            if (result.kaptCode) {
                await executeQuery(`
                    UPDATE apt_search_index SET kapt_code = ? WHERE id = ?
                `, [result.kaptCode, apt.id]);
                matched++;
                if (result.multiMatch) multiMatch++;
            } else {
                // 매칭 실패한 것도 표시 (다시 시도 안하게)
                await executeQuery(`
                    UPDATE apt_search_index SET kapt_code = 'UNMAPPED' WHERE id = ?
                `, [apt.id]);
                noMatch++;
            }

            processed++;
        }

        // 진행률 출력
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / elapsed).toFixed(1);
        console.log(`   처리: ${processed.toLocaleString()} | 매칭: ${matched} | 미매칭: ${noMatch} | (${rate}/초)`);
    }

    // 3. 결과 요약
    console.log('\n=== 결과 요약 ===');
    console.log(`   총 처리: ${processed.toLocaleString()}`);
    console.log(`   매칭 성공: ${matched.toLocaleString()} (${(matched * 100 / processed).toFixed(1)}%)`);
    console.log(`   다중 후보: ${multiMatch.toLocaleString()}`);
    console.log(`   매칭 실패: ${noMatch.toLocaleString()}`);

    // 4. 최종 통계
    const finalStats = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN kapt_code IS NOT NULL AND kapt_code != 'UNMAPPED' THEN 1 ELSE 0 END) as mapped,
            SUM(CASE WHEN kapt_code = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped
        FROM apt_search_index
    `);
    console.log(`\n📊 최종 현황:`);
    console.log(`   매핑됨: ${finalStats[0].mapped.toLocaleString()}/${finalStats[0].total.toLocaleString()}`);
    console.log(`   미매핑: ${finalStats[0].unmapped.toLocaleString()}`);

    console.log('\n=== 매핑 완료 ===');
    await closeConnection();
}

/**
 * 단일 아파트에 대해 kaptCode 매칭
 */
async function matchKaptCode(apt) {
    const { aptNm, umdNm, jibun } = apt;

    // 지번에서 숫자만 추출 (123-45 → 123)
    const jibunMain = jibun.split('-')[0].trim();

    // 1. 정확 매칭: 동 + 지번 + 이름
    let candidates = await executeQuery(`
        SELECT kaptCode, kaptName, kaptdaCnt, kaptAddr
        FROM apt_basic_info
        WHERE kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
          AND kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
          AND (
            REPLACE(kaptName, ' ', '') COLLATE utf8mb4_unicode_ci = REPLACE(?, ' ', '') COLLATE utf8mb4_unicode_ci
            OR REPLACE(kaptName, ' ', '') COLLATE utf8mb4_unicode_ci = CONCAT(REPLACE(?, ' ', ''), '아파트') COLLATE utf8mb4_unicode_ci
            OR kaptName COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
          )
        ORDER BY kaptdaCnt DESC
        LIMIT 5
    `, [umdNm, jibunMain, aptNm, aptNm, aptNm]);

    if (candidates.length === 1) {
        return { kaptCode: candidates[0].kaptCode, multiMatch: false };
    }

    if (candidates.length > 1) {
        // 정확 이름 매칭 우선
        const exact = candidates.find(c =>
            c.kaptName.replace(/\s+/g, '') === aptNm.replace(/\s+/g, '') ||
            c.kaptName.replace(/\s+/g, '') === aptNm.replace(/\s+/g, '') + '아파트'
        );
        if (exact) {
            return { kaptCode: exact.kaptCode, multiMatch: true };
        }
        // 세대수 가장 많은 것
        return { kaptCode: candidates[0].kaptCode, multiMatch: true };
    }

    // 2. 완화된 매칭: 동 + 지번만 (이름 무시)
    candidates = await executeQuery(`
        SELECT kaptCode, kaptName, kaptdaCnt, kaptAddr
        FROM apt_basic_info
        WHERE kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
          AND kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
        ORDER BY kaptdaCnt DESC
        LIMIT 1
    `, [umdNm, jibunMain]);

    if (candidates.length === 1) {
        return { kaptCode: candidates[0].kaptCode, multiMatch: false };
    }

    return { kaptCode: null, multiMatch: false };
}

main().catch(e => {
    console.error('오류:', e);
    closeConnection();
    process.exit(1);
});
