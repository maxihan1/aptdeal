/**
 * 검색 인덱스 세대수 업데이트 - 향상된 매칭 로직
 * 더 많은 아파트에 세대수를 연결
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';

async function improveHouseholdMatching() {
    console.log('=== 세대수 매칭 개선 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('DB 연결 실패. 종료합니다.');
        process.exit(1);
    }

    try {
        // 현재 상태 확인
        const [before] = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN householdCount > 0 THEN 1 ELSE 0 END) as withHousehold
            FROM apt_search_index
        `);
        console.log(`현재 상태: ${before.withHousehold.toLocaleString()}개 / ${before.total.toLocaleString()}개 매칭됨\n`);

        // 1. 부분 매칭: aptNm이 kaptName을 포함하거나 vice versa
        console.log('1. 부분 매칭 시도 중...');
        const result1 = await executeQuery(`
            UPDATE apt_search_index s
            JOIN (
                SELECT 
                    REPLACE(kaptName, ' ', '') COLLATE utf8mb4_unicode_ci as kaptNameNorm,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) COLLATE utf8mb4_unicode_ci as dong,
                    kaptdaCnt
                FROM apt_basic_info
                WHERE kaptdaCnt IS NOT NULL AND kaptdaCnt > 0
            ) b ON 
                s.umdNm = b.dong COLLATE utf8mb4_unicode_ci
                AND (
                    s.aptNmNormalized LIKE CONCAT('%', b.kaptNameNorm, '%') COLLATE utf8mb4_unicode_ci
                    OR b.kaptNameNorm LIKE CONCAT('%', s.aptNmNormalized, '%') COLLATE utf8mb4_unicode_ci
                )
            SET s.householdCount = b.kaptdaCnt
            WHERE s.householdCount = 0
        `);
        console.log(`   ${result1.affectedRows}개 업데이트됨`);

        // 2. 앞부분 매칭: aptNm 앞 5자가 kaptName 앞 5자와 동일
        console.log('2. 앞부분 매칭 시도 중...');
        const result2 = await executeQuery(`
            UPDATE apt_search_index s
            JOIN (
                SELECT 
                    LEFT(REPLACE(kaptName, ' ', ''), 5) COLLATE utf8mb4_unicode_ci as kaptNamePrefix,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) COLLATE utf8mb4_unicode_ci as dong,
                    kaptdaCnt
                FROM apt_basic_info
                WHERE kaptdaCnt IS NOT NULL AND kaptdaCnt > 0 AND LENGTH(REPLACE(kaptName, ' ', '')) >= 5
            ) b ON 
                s.umdNm = b.dong COLLATE utf8mb4_unicode_ci
                AND LEFT(s.aptNmNormalized, 5) = b.kaptNamePrefix COLLATE utf8mb4_unicode_ci
            SET s.householdCount = b.kaptdaCnt
            WHERE s.householdCount = 0
        `);
        console.log(`   ${result2.affectedRows}개 업데이트됨`);

        // 3. "아파트" 제거 후 매칭
        console.log('3. "아파트" 제거 후 매칭 시도 중...');
        const result3 = await executeQuery(`
            UPDATE apt_search_index s
            JOIN (
                SELECT 
                    REPLACE(REPLACE(kaptName, ' ', ''), '아파트', '') COLLATE utf8mb4_unicode_ci as kaptNameClean,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) COLLATE utf8mb4_unicode_ci as dong,
                    kaptdaCnt
                FROM apt_basic_info
                WHERE kaptdaCnt IS NOT NULL AND kaptdaCnt > 0
            ) b ON 
                s.umdNm = b.dong COLLATE utf8mb4_unicode_ci
                AND REPLACE(s.aptNmNormalized, '아파트', '') = b.kaptNameClean COLLATE utf8mb4_unicode_ci
            SET s.householdCount = b.kaptdaCnt
            WHERE s.householdCount = 0
        `);
        console.log(`   ${result3.affectedRows}개 업데이트됨`);

        // 결과 확인
        const [after] = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN householdCount > 0 THEN 1 ELSE 0 END) as withHousehold
            FROM apt_search_index
        `);
        console.log(`\n최종 상태: ${after.withHousehold.toLocaleString()}개 / ${after.total.toLocaleString()}개 매칭됨`);
        console.log(`개선: +${(after.withHousehold - before.withHousehold).toLocaleString()}개`);

        console.log('\n=== 세대수 매칭 개선 완료! ===');

    } catch (error) {
        console.error('오류 발생:', error);
        throw error;
    } finally {
        await closeConnection();
    }
}

improveHouseholdMatching().catch(console.error);
