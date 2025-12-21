/**
 * 아파트 가격 캐시 테이블 생성 및 데이터 적재
 * 
 * 실행: node src/scripts/data-loader/create_price_cache.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS apt_price_cache (
    kapt_code VARCHAR(20) PRIMARY KEY COMMENT 'K-apt 단지 코드',
    kapt_name VARCHAR(100) COMMENT '아파트명',
    avg_price_30d BIGINT DEFAULT 0 COMMENT '최근 30일 평균 거래가 (만원)',
    avg_price_90d BIGINT DEFAULT 0 COMMENT '최근 90일 평균 거래가 (만원)',
    avg_price_365d BIGINT DEFAULT 0 COMMENT '최근 1년 평균 거래가 (만원)',
    deal_count_30d INT DEFAULT 0 COMMENT '최근 30일 거래 건수',
    deal_count_90d INT DEFAULT 0 COMMENT '최근 90일 거래 건수',
    deal_count_365d INT DEFAULT 0 COMMENT '최근 1년 거래 건수',
    min_price_365d BIGINT DEFAULT 0 COMMENT '최근 1년 최저가',
    max_price_365d BIGINT DEFAULT 0 COMMENT '최근 1년 최고가',
    latest_deal_date DATE COMMENT '최근 거래일 (1년 내)',
    last_deal_price BIGINT DEFAULT 0 COMMENT '마지막 거래가 (전체 기간)',
    last_deal_date DATE COMMENT '마지막 거래일 (전체 기간)',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at),
    INDEX idx_kapt_name (kapt_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='아파트 가격 캐시 테이블 (지도용)'
`;

// apt_name_mapping을 통해 가격 데이터 집계
const REFRESH_CACHE_SQL = `
INSERT INTO apt_price_cache (
    kapt_code, kapt_name,
    avg_price_30d, avg_price_90d, avg_price_365d,
    deal_count_30d, deal_count_90d, deal_count_365d,
    min_price_365d, max_price_365d, latest_deal_date,
    last_deal_price, last_deal_date
)
SELECT 
    b.kaptCode,
    b.kaptName,
    COALESCE(d30.avg_price, 0) as avg_price_30d,
    COALESCE(d90.avg_price, 0) as avg_price_90d,
    COALESCE(d365.avg_price, 0) as avg_price_365d,
    COALESCE(d30.deal_count, 0) as deal_count_30d,
    COALESCE(d90.deal_count, 0) as deal_count_90d,
    COALESCE(d365.deal_count, 0) as deal_count_365d,
    COALESCE(d365.min_price, 0) as min_price_365d,
    COALESCE(d365.max_price, 0) as max_price_365d,
    d365.latest_date as latest_deal_date,
    COALESCE(last_d.last_price, 0) as last_deal_price,
    last_d.last_date as last_deal_date
FROM apt_basic_info b
LEFT JOIN (
    SELECT 
        m.kapt_code,
        ROUND(AVG(d.dealAmount)) as avg_price,
        COUNT(*) as deal_count
    FROM apt_name_mapping m
    JOIN apt_deal_info d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_0900_ai_ci
                        AND m.umd_nm = d.umdNm COLLATE utf8mb4_0900_ai_ci
    WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      AND (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY m.kapt_code
) d30 ON b.kaptCode COLLATE utf8mb4_0900_ai_ci = d30.kapt_code COLLATE utf8mb4_0900_ai_ci
LEFT JOIN (
    SELECT 
        m.kapt_code,
        ROUND(AVG(d.dealAmount)) as avg_price,
        COUNT(*) as deal_count
    FROM apt_name_mapping m
    JOIN apt_deal_info d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_0900_ai_ci
                        AND m.umd_nm = d.umdNm COLLATE utf8mb4_0900_ai_ci
    WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
      AND (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY m.kapt_code
) d90 ON b.kaptCode COLLATE utf8mb4_0900_ai_ci = d90.kapt_code COLLATE utf8mb4_0900_ai_ci
LEFT JOIN (
    SELECT 
        m.kapt_code,
        ROUND(AVG(d.dealAmount)) as avg_price,
        COUNT(*) as deal_count,
        MIN(d.dealAmount) as min_price,
        MAX(d.dealAmount) as max_price,
        MAX(d.dealDate) as latest_date
    FROM apt_name_mapping m
    JOIN apt_deal_info d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_0900_ai_ci
                        AND m.umd_nm = d.umdNm COLLATE utf8mb4_0900_ai_ci
    WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)
      AND (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY m.kapt_code
) d365 ON b.kaptCode COLLATE utf8mb4_0900_ai_ci = d365.kapt_code COLLATE utf8mb4_0900_ai_ci
LEFT JOIN (
    -- 전체 기간 중 마지막 거래 (1년 이전 포함)
    SELECT 
        m.kapt_code,
        MAX(d.dealAmount) as last_price,
        MAX(d.dealDate) as last_date
    FROM apt_name_mapping m
    JOIN apt_deal_info d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_0900_ai_ci
                        AND m.umd_nm = d.umdNm COLLATE utf8mb4_0900_ai_ci
    WHERE (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY m.kapt_code
) last_d ON b.kaptCode COLLATE utf8mb4_0900_ai_ci = last_d.kapt_code COLLATE utf8mb4_0900_ai_ci
WHERE b.latitude IS NOT NULL AND b.longitude IS NOT NULL
ON DUPLICATE KEY UPDATE
    kapt_name = VALUES(kapt_name),
    avg_price_30d = VALUES(avg_price_30d),
    avg_price_90d = VALUES(avg_price_90d),
    avg_price_365d = VALUES(avg_price_365d),
    deal_count_30d = VALUES(deal_count_30d),
    deal_count_90d = VALUES(deal_count_90d),
    deal_count_365d = VALUES(deal_count_365d),
    min_price_365d = VALUES(min_price_365d),
    max_price_365d = VALUES(max_price_365d),
    latest_deal_date = VALUES(latest_deal_date),
    last_deal_price = VALUES(last_deal_price),
    last_deal_date = VALUES(last_deal_date),
    updated_at = CURRENT_TIMESTAMP
`;

async function main() {
    logSection('아파트 가격 캐시 테이블 생성');

    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 1. 테이블 생성
        log('📋 테이블 생성 중...');
        await executeQuery(CREATE_TABLE_SQL);
        logSuccess('apt_price_cache 테이블 생성 완료');

        // 1.5. 컬럼이 없으면 추가 (기존 테이블 업그레이드)
        try {
            await executeQuery(`ALTER TABLE apt_price_cache ADD COLUMN last_deal_price BIGINT DEFAULT 0 COMMENT '마지막 거래가 (전체 기간)'`);
            log('   컬럼 추가: last_deal_price');
        } catch (e) {
            // 이미 존재하면 무시
        }
        try {
            await executeQuery(`ALTER TABLE apt_price_cache ADD COLUMN last_deal_date DATE COMMENT '마지막 거래일 (전체 기간)'`);
            log('   컬럼 추가: last_deal_date');
        } catch (e) {
            // 이미 존재하면 무시
        }

        // 2. 캐시 데이터 적재
        log('📊 가격 캐시 데이터 적재 중... (시간이 걸릴 수 있습니다)');
        const startTime = Date.now();

        const result = await executeQuery(REFRESH_CACHE_SQL);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logSuccess(`캐시 데이터 적재 완료 (${elapsed}초)`);

        // 2.5. 직접 이름 매칭으로 빈 데이터 채우기 (apt_name_mapping에 없는 것)
        log('📊 직접 이름 매칭으로 추가 데이터 적재 중...');
        const startTime2 = Date.now();

        // 가격이 없는 아파트에 대해 이름 직접 비교로 업데이트
        await executeQuery(`
            UPDATE apt_price_cache pc
            JOIN (
                SELECT 
                    b.kaptCode,
                    COALESCE(d.avg_price, 0) as avg_price,
                    COALESCE(d.deal_count, 0) as deal_count,
                    d.last_price,
                    d.last_date
                FROM apt_basic_info b
                JOIN (
                    SELECT 
                        REPLACE(REPLACE(aptNm, ' ', ''), '아파트', '') as aptNmNorm,
                        ROUND(AVG(dealAmount)) as avg_price,
                        COUNT(*) as deal_count,
                        MAX(dealAmount) as last_price,
                        MAX(dealDate) as last_date
                    FROM apt_deal_info
                    WHERE (cdealType IS NULL OR cdealType = '')
                    GROUP BY REPLACE(REPLACE(aptNm, ' ', ''), '아파트', '')
                ) d ON REPLACE(REPLACE(b.kaptName, ' ', ''), '아파트', '') = d.aptNmNorm COLLATE utf8mb4_0900_ai_ci
                WHERE b.latitude IS NOT NULL
            ) direct ON pc.kapt_code COLLATE utf8mb4_0900_ai_ci = direct.kaptCode COLLATE utf8mb4_0900_ai_ci
            SET 
                pc.avg_price_365d = CASE WHEN pc.avg_price_365d = 0 THEN direct.avg_price ELSE pc.avg_price_365d END,
                pc.deal_count_365d = CASE WHEN pc.deal_count_365d = 0 THEN direct.deal_count ELSE pc.deal_count_365d END,
                pc.last_deal_price = CASE WHEN pc.last_deal_price = 0 THEN direct.last_price ELSE pc.last_deal_price END,
                pc.last_deal_date = CASE WHEN pc.last_deal_date IS NULL THEN direct.last_date ELSE pc.last_deal_date END
            WHERE pc.avg_price_365d = 0 OR pc.last_deal_price = 0
        `);

        const elapsed2 = ((Date.now() - startTime2) / 1000).toFixed(1);
        logSuccess(`직접 매칭 적재 완료 (${elapsed2}초)`);

        // 3. 통계 확인
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN avg_price_365d > 0 OR last_deal_price > 0 THEN 1 ELSE 0 END) as with_price,
                SUM(CASE WHEN deal_count_30d > 0 THEN 1 ELSE 0 END) as recent_deals
            FROM apt_price_cache
        `);

        if (stats.length > 0) {
            const { total, with_price, recent_deals } = stats[0];
            log(`\n📈 캐시 통계:`);
            log(`   - 전체 아파트: ${total.toLocaleString()}개`);
            log(`   - 가격 정보 있음: ${with_price.toLocaleString()}개`);
            log(`   - 최근 30일 거래: ${recent_deals.toLocaleString()}개`);
        }

    } catch (error) {
        logError('캐시 생성 실패:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }

    logSuccess('\n✅ 가격 캐시 생성 완료!');
}

main().catch(error => {
    logError('스크립트 실행 실패:', error);
    process.exit(1);
});
