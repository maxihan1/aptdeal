/**
 * 전월세 가격을 apt_price_cache에 추가 (별도 컬럼으로)
 * 기존 매매 데이터는 유지하고, rent_avg_price, rent_count 컬럼만 업데이트
 * 
 * 실행: node src/scripts/data-loader/add_rent_price_columns.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';
import { fileURLToPath } from 'url';

// 1. 전월세 컬럼 추가
const ADD_COLUMNS_SQL = `
ALTER TABLE apt_price_cache 
ADD COLUMN IF NOT EXISTS rent_avg_price BIGINT DEFAULT 0 COMMENT '전월세 평균 보증금 (만원)',
ADD COLUMN IF NOT EXISTS rent_count_365d INT DEFAULT 0 COMMENT '최근 1년 전월세 거래 수'
`;

// 2. 전월세 가격 업데이트 (apt_name_mapping 통한)
const UPDATE_RENT_PRICES_SQL = `
UPDATE apt_price_cache pc
JOIN (
    SELECT 
        m.kapt_code,
        ROUND(AVG(r.deposit)) as avg_deposit,
        COUNT(*) as rent_count
    FROM apt_name_mapping m
    JOIN apt_rent_info r ON m.deal_apt_name = r.aptNm COLLATE utf8mb4_0900_ai_ci
    WHERE r.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND r.deposit > 0
    GROUP BY m.kapt_code
) rent ON pc.kapt_code COLLATE utf8mb4_0900_ai_ci = rent.kapt_code COLLATE utf8mb4_0900_ai_ci
SET 
    pc.rent_avg_price = rent.avg_deposit,
    pc.rent_count_365d = rent.rent_count
`;

// 3. 직접 이름 매칭으로 전월세 업데이트
const DIRECT_RENT_UPDATE_SQL = `
UPDATE apt_price_cache pc
JOIN apt_basic_info b ON pc.kapt_code COLLATE utf8mb4_0900_ai_ci = b.kaptCode COLLATE utf8mb4_0900_ai_ci
JOIN (
    SELECT 
        REPLACE(REPLACE(aptNm, ' ', ''), '아파트', '') as aptNmNorm,
        ROUND(AVG(deposit)) as avg_deposit,
        COUNT(*) as rent_count
    FROM apt_rent_info
    WHERE dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND deposit > 0
    GROUP BY REPLACE(REPLACE(aptNm, ' ', ''), '아파트', '')
) rent ON REPLACE(REPLACE(b.kaptName, ' ', ''), '아파트', '') = rent.aptNmNorm COLLATE utf8mb4_0900_ai_ci
SET 
    pc.rent_avg_price = CASE WHEN pc.rent_avg_price = 0 THEN rent.avg_deposit ELSE pc.rent_avg_price END,
    pc.rent_count_365d = CASE WHEN pc.rent_count_365d = 0 THEN rent.rent_count ELSE pc.rent_count_365d END
WHERE pc.rent_avg_price = 0
`;

async function addRentPriceColumns() {
    logSection('🏠 전월세 가격 컬럼 추가');

    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결 실패');
        throw new Error('Database connection failed');
    }

    try {
        // 1. 컬럼 추가 (없으면 추가)
        log('📋 rent_avg_price, rent_count_365d 컬럼 확인/추가 중...');

        // 컬럼 존재 확인
        const columns = await executeQuery(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'apt_price_cache'
            AND COLUMN_NAME IN ('rent_avg_price', 'rent_count_365d')
        `);
        const existingCols = columns.map(c => c.COLUMN_NAME);

        if (!existingCols.includes('rent_avg_price')) {
            await executeQuery(`ALTER TABLE apt_price_cache ADD COLUMN rent_avg_price BIGINT DEFAULT 0 COMMENT '전월세 평균 보증금 (만원)'`);
            log('   - rent_avg_price 컬럼 추가됨');
        }
        if (!existingCols.includes('rent_count_365d')) {
            await executeQuery(`ALTER TABLE apt_price_cache ADD COLUMN rent_count_365d INT DEFAULT 0 COMMENT '최근 1년 전월세 거래 수'`);
            log('   - rent_count_365d 컬럼 추가됨');
        }
        logSuccess('컬럼 확인 완료');

        // 2. 전월세 가격 업데이트 (apt_name_mapping)
        log('\n📊 전월세 가격 업데이트 중 (apt_name_mapping)...');
        const startTime = Date.now();
        const result1 = await executeQuery(UPDATE_RENT_PRICES_SQL);
        log(`   - 업데이트됨: ${result1.affectedRows}개`);
        const elapsed1 = ((Date.now() - startTime) / 1000).toFixed(1);
        logSuccess(`완료 (${elapsed1}초)`);

        // 3. 직접 이름 매칭
        log('\n📊 전월세 가격 업데이트 중 (직접 매칭)...');
        const startTime2 = Date.now();
        const result2 = await executeQuery(DIRECT_RENT_UPDATE_SQL);
        log(`   - 업데이트됨: ${result2.affectedRows}개`);
        const elapsed2 = ((Date.now() - startTime2) / 1000).toFixed(1);
        logSuccess(`완료 (${elapsed2}초)`);

        // 4. 통계
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN avg_price_365d > 0 OR last_deal_price > 0 THEN 1 ELSE 0 END) as with_sale_price,
                SUM(CASE WHEN rent_avg_price > 0 THEN 1 ELSE 0 END) as with_rent_price
            FROM apt_price_cache
        `);

        log(`\n📈 캐시 통계:`);
        log(`   - 전체: ${stats[0].total}개`);
        log(`   - 매매 가격 있음: ${stats[0].with_sale_price}개`);
        log(`   - 전월세 가격 있음: ${stats[0].with_rent_price}개`);

    } catch (error) {
        logError('전월세 가격 추가 실패:', error.message);
        throw error;
    }

    logSuccess('\n✅ 전월세 가격 추가 완료!');
}

// 직접 실행 시
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    addRentPriceColumns()
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

export { addRentPriceColumns };
