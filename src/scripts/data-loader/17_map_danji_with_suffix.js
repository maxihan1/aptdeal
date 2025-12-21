/**
 * UNMAPPED 단지별 아파트에 kapt_code_N 형태로 매핑
 * 
 * 예: 마포래미안푸르지오1단지 → A12175203_1
 * 
 * 실행: node src/scripts/data-loader/17_map_danji_with_suffix.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== 단지별 아파트 매핑 (kapt_code_N) ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // UNMAPPED 중 단지/차수 패턴 있는 것
        const unmapped = await executeQuery(`
            SELECT id, aptNm, umdNm, jibun
            FROM apt_search_index
            WHERE kapt_code = 'UNMAPPED'
              AND (aptNm REGEXP '[0-9]+단지' OR aptNm REGEXP '[0-9]+차')
        `);

        console.log(`대상: ${unmapped.length}개\n`);

        let matched = 0;
        let processed = 0;
        const startTime = Date.now();

        for (const apt of unmapped) {
            processed++;

            // 단지/차수 번호 추출
            let suffix = '';
            const danjiMatch = apt.aptNm.match(/([0-9]+)단지/);
            const chaMatch = apt.aptNm.match(/([0-9]+)차/);

            if (danjiMatch) {
                suffix = '_' + danjiMatch[1];
            } else if (chaMatch) {
                suffix = '_' + chaMatch[1] + 'c';  // 차수는 c 붙임
            }

            // 기본 이름 추출 (단지/차수 제거)
            const baseName = apt.aptNm
                .replace(/[0-9]+단지/g, '')
                .replace(/[0-9]+차/g, '')
                .replace(/\s+/g, '')
                .replace(/아파트$/g, '')
                .trim();

            if (baseName.length < 2 || !suffix) continue;

            // K-apt에서 같은 동 + 유사 이름 검색
            let kapt = await executeQuery(`
                SELECT kaptCode, kaptName
                FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND (
                    REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%')
                    OR REPLACE(REPLACE(kaptName, ' ', ''), '아파트', '') LIKE CONCAT('%', ?, '%')
                  )
                ORDER BY LENGTH(kaptName)
                LIMIT 1
            `, [apt.umdNm, baseName, baseName]);

            // 동 매칭 실패시 이름만으로 재시도
            if (kapt.length === 0) {
                kapt = await executeQuery(`
                    SELECT kaptCode, kaptName
                    FROM apt_basic_info
                    WHERE REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%')
                       OR REPLACE(REPLACE(kaptName, ' ', ''), '아파트', '') LIKE CONCAT('%', ?, '%')
                    ORDER BY LENGTH(kaptName)
                    LIMIT 1
                `, [baseName, baseName]);
            }

            if (kapt.length > 0) {
                const newCode = kapt[0].kaptCode + suffix;
                await executeQuery('UPDATE apt_search_index SET kapt_code = ? WHERE id = ?', [newCode, apt.id]);
                matched++;

                if (matched <= 10) {
                    console.log(`✅ ${apt.aptNm} → ${newCode}`);
                }
            }

            if (processed % 200 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                console.log(`   처리: ${processed}/${unmapped.length} | 매핑: ${matched} | ${elapsed}초`);
            }
        }

        console.log(`\n=== 완료 ===`);
        console.log(`처리: ${processed}`);
        console.log(`매핑 성공: ${matched}`);

        // 전체 매핑 통계
        const [stats] = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN kapt_code IS NOT NULL AND kapt_code != 'UNMAPPED' THEN 1 ELSE 0 END) as mapped
            FROM apt_search_index
        `);
        console.log(`\n전체 매핑률: ${stats.mapped}/${stats.total} (${(stats.mapped * 100 / stats.total).toFixed(1)}%)`);

    } catch (error) {
        console.error('오류:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }
}

main().catch(error => {
    console.error('스크립트 실행 실패:', error);
    process.exit(1);
});
