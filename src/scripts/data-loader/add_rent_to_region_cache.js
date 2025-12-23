/**
 * 지역별 전월세 가격 캐시 추가 스크립트
 * region_price_cache에 rent_avg_price 컬럼 추가 및 데이터 적재
 * 
 * 실행: node src/scripts/data-loader/add_rent_to_region_cache.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';
import { fileURLToPath } from 'url';

// 컬럼 추가 (없으면 추가)
async function addRentColumn() {
    const columns = await executeQuery(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'region_price_cache'
        AND COLUMN_NAME = 'rent_avg_price'
    `);

    if (columns.length === 0) {
        await executeQuery(`
            ALTER TABLE region_price_cache 
            ADD COLUMN rent_avg_price BIGINT DEFAULT 0 COMMENT '전월세 평균 보증금 (만원)'
        `);
        log('   - rent_avg_price 컬럼 추가됨');
    } else {
        log('   - rent_avg_price 컬럼 이미 존재');
    }
}

// 시도별 전월세 가격 업데이트
const UPDATE_SIDO_RENT_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        ROUND(AVG(r.deposit)) as rent_avg
    FROM apt_rent_info r
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1 FROM apt_list) l 
        ON r.sggCd COLLATE utf8mb4_unicode_ci = l.sggCode COLLATE utf8mb4_unicode_ci
    WHERE r.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND r.deposit > 0
      AND (r.monthlyRent = 0 OR r.monthlyRent IS NULL)
    GROUP BY l.as1
) p ON rc.region_type = 'sido' 
    AND rc.region_name COLLATE utf8mb4_unicode_ci = p.sido COLLATE utf8mb4_unicode_ci
SET rc.rent_avg_price = COALESCE(p.rent_avg, 0)
`;

// 시군구별 전월세 가격 업데이트
const UPDATE_SIGUNGU_RENT_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        l.as2 as sigungu,
        ROUND(AVG(r.deposit)) as rent_avg
    FROM apt_rent_info r
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2 FROM apt_list) l 
        ON r.sggCd COLLATE utf8mb4_unicode_ci = l.sggCode COLLATE utf8mb4_unicode_ci
    WHERE r.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND r.deposit > 0
      AND (r.monthlyRent = 0 OR r.monthlyRent IS NULL)
    GROUP BY l.as1, l.as2
) p ON rc.region_type = 'sigungu' 
    AND rc.region_name COLLATE utf8mb4_unicode_ci = p.sigungu COLLATE utf8mb4_unicode_ci 
    AND rc.parent_name COLLATE utf8mb4_unicode_ci = p.sido COLLATE utf8mb4_unicode_ci
SET rc.rent_avg_price = COALESCE(p.rent_avg, 0)
`;

// 읍면동별 전월세 가격 업데이트
const UPDATE_DONG_RENT_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        l.as2 as sigungu,
        r.umdNm as dong,
        ROUND(AVG(r.deposit)) as rent_avg
    FROM apt_rent_info r
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2 FROM apt_list) l 
        ON r.sggCd COLLATE utf8mb4_unicode_ci = l.sggCode COLLATE utf8mb4_unicode_ci
    WHERE r.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND r.deposit > 0
      AND (r.monthlyRent = 0 OR r.monthlyRent IS NULL)
    GROUP BY l.as1, l.as2, r.umdNm
) p ON rc.region_type = 'dong' 
    AND rc.region_name COLLATE utf8mb4_unicode_ci = p.dong COLLATE utf8mb4_unicode_ci 
    AND rc.parent_name COLLATE utf8mb4_unicode_ci = CONCAT(p.sido, ' ', p.sigungu) COLLATE utf8mb4_unicode_ci
SET rc.rent_avg_price = COALESCE(p.rent_avg, 0)
`;

export async function addRentToRegionCache() {
    logSection('🏠 지역별 전월세 가격 캐시 추가');

    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결 실패');
        throw new Error('Database connection failed');
    }

    try {
        // 1. 컬럼 추가
        log('📋 rent_avg_price 컬럼 확인/추가 중...');
        await addRentColumn();
        logSuccess('컬럼 확인 완료');

        const startTime = Date.now();

        // 2. 시도 전월세 가격 업데이트
        log('\n📊 시도별 전월세 가격 업데이트 중...');
        const r1 = await executeQuery(UPDATE_SIDO_RENT_SQL);
        log(`   - 업데이트됨: ${r1.affectedRows}개`);

        // 3. 시군구 전월세 가격 업데이트
        log('📊 시군구별 전월세 가격 업데이트 중...');
        const r2 = await executeQuery(UPDATE_SIGUNGU_RENT_SQL);
        log(`   - 업데이트됨: ${r2.affectedRows}개`);

        // 4. 읍면동 전월세 가격 업데이트
        log('📊 읍면동별 전월세 가격 업데이트 중...');
        const r3 = await executeQuery(UPDATE_DONG_RENT_SQL);
        log(`   - 업데이트됨: ${r3.affectedRows}개`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // 5. 통계
        const stats = await executeQuery(`
            SELECT 
                region_type,
                COUNT(*) as total,
                SUM(CASE WHEN rent_avg_price > 0 THEN 1 ELSE 0 END) as with_rent
            FROM region_price_cache
            GROUP BY region_type
        `);

        log(`\n📈 전월세 가격 통계:`);
        for (const row of stats) {
            log(`   - ${row.region_type}: ${row.with_rent}/${row.total}개 지역`);
        }

        logSuccess(`\n✅ 지역별 전월세 가격 추가 완료! (${elapsed}초)`);

    } catch (error) {
        logError('전월세 가격 추가 실패:', error.message);
        throw error;
    }
}

// 직접 실행 시
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    addRentToRegionCache()
        .then(async () => {
            await closeConnection();
            process.exit(0);
        })
        .catch(async (error) => {
            logError('스크립트 실행 실패:', error);
            await closeConnection();
            process.exit(1);
        });
}
