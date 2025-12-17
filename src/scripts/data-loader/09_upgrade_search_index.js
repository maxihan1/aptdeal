/**
 * 검색 인덱스 테이블 업그레이드
 * - 세대수 컬럼 추가
 * - 정규화된 아파트명 컬럼 추가 (공백 제거)
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';

async function upgradeSearchIndex() {
    console.log('=== 검색 인덱스 테이블 업그레이드 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('DB 연결 실패. 종료합니다.');
        process.exit(1);
    }

    try {
        // 1. 새 컬럼 추가
        console.log('1. 새 컬럼 추가 중...');

        // 세대수 컬럼
        try {
            await executeQuery('ALTER TABLE apt_search_index ADD COLUMN householdCount INT DEFAULT 0');
            console.log('   householdCount 컬럼 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   householdCount 컬럼 이미 존재');
            } else throw e;
        }

        // 정규화된 아파트명 (공백 제거)
        try {
            await executeQuery('ALTER TABLE apt_search_index ADD COLUMN aptNmNormalized VARCHAR(100) GENERATED ALWAYS AS (REPLACE(aptNm, \' \', \'\')) STORED');
            console.log('   aptNmNormalized 컬럼 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   aptNmNormalized 컬럼 이미 존재');
            } else throw e;
        }

        // 정규화된 동명 (공백 제거)
        try {
            await executeQuery('ALTER TABLE apt_search_index ADD COLUMN umdNmNormalized VARCHAR(50) GENERATED ALWAYS AS (REPLACE(umdNm, \' \', \'\')) STORED');
            console.log('   umdNmNormalized 컬럼 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   umdNmNormalized 컬럼 이미 존재');
            } else throw e;
        }

        // 2. 인덱스 추가
        console.log('\n2. 인덱스 추가 중...');
        try {
            await executeQuery('CREATE INDEX idx_aptNmNormalized ON apt_search_index(aptNmNormalized)');
            console.log('   idx_aptNmNormalized 인덱스 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   idx_aptNmNormalized 인덱스 이미 존재');
            } else throw e;
        }

        try {
            await executeQuery('CREATE INDEX idx_umdNmNormalized ON apt_search_index(umdNmNormalized)');
            console.log('   idx_umdNmNormalized 인덱스 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   idx_umdNmNormalized 인덱스 이미 존재');
            } else throw e;
        }

        try {
            await executeQuery('CREATE INDEX idx_householdCount ON apt_search_index(householdCount DESC)');
            console.log('   idx_householdCount 인덱스 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   idx_householdCount 인덱스 이미 존재');
            } else throw e;
        }

        // 3. 세대수 데이터 업데이트 (apt_basic_info에서)
        console.log('\n3. 세대수 데이터 업데이트 중...');
        const startTime = Date.now();

        // apt_basic_info와 매칭하여 세대수 업데이트
        // 이름 매칭: 공백 제거 후 비교
        const result = await executeQuery(`
            UPDATE apt_search_index s
            JOIN (
                SELECT 
                    REPLACE(kaptName, ' ', '') COLLATE utf8mb4_unicode_ci as kaptNameNorm,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) COLLATE utf8mb4_unicode_ci as dong,
                    kaptdaCnt
                FROM apt_basic_info
                WHERE kaptdaCnt IS NOT NULL AND kaptdaCnt > 0
            ) b ON s.aptNmNormalized = b.kaptNameNorm COLLATE utf8mb4_unicode_ci
               AND s.umdNm = b.dong COLLATE utf8mb4_unicode_ci
            SET s.householdCount = b.kaptdaCnt
        `);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   업데이트 완료: ${result.affectedRows}개 행 (${elapsed}초)`);

        // 4. 통계 확인
        console.log('\n4. 통계 확인:');
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN householdCount > 0 THEN 1 ELSE 0 END) as withHousehold,
                MAX(householdCount) as maxHousehold,
                AVG(householdCount) as avgHousehold
            FROM apt_search_index
        `);
        console.log(`   총 항목: ${stats[0].total.toLocaleString()}개`);
        console.log(`   세대수 있음: ${stats[0].withHousehold.toLocaleString()}개`);
        console.log(`   최대 세대수: ${stats[0].maxHousehold?.toLocaleString() || 0}세대`);
        console.log(`   평균 세대수: ${Math.round(stats[0].avgHousehold || 0)}세대`);

        // 5. 샘플 확인
        console.log('\n5. 세대수 상위 5개:');
        const samples = await executeQuery(`
            SELECT aptNm, umdNm, sido, sigungu, householdCount, dealCount
            FROM apt_search_index
            WHERE householdCount > 0
            ORDER BY householdCount DESC
            LIMIT 5
        `);
        samples.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.sido} ${row.sigungu} ${row.umdNm} ${row.aptNm} (${row.householdCount}세대, ${row.dealCount}건)`);
        });

        console.log('\n=== 검색 인덱스 업그레이드 완료! ===');

    } catch (error) {
        console.error('오류 발생:', error);
        throw error;
    } finally {
        await closeConnection();
    }
}

upgradeSearchIndex().catch(console.error);
