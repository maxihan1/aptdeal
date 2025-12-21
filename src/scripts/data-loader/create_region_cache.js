/**
 * 지역별 가격 캐시 테이블 생성 및 데이터 적재
 * 
 * 실행: node src/scripts/data-loader/create_region_cache.js
 * 
 * 스케줄러(06_daily_sync.js)에서 일일 호출됨
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';
import { fileURLToPath } from 'url';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS region_price_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    region_type ENUM('sido', 'sigungu', 'dong') NOT NULL COMMENT '지역 유형',
    region_code VARCHAR(10) COMMENT '지역 코드',
    region_name VARCHAR(100) NOT NULL COMMENT '지역명',
    parent_name VARCHAR(100) COMMENT '상위 지역명 (시군구는 시도, 동은 시군구)',
    center_lat DECIMAL(10,7) COMMENT '중심 위도',
    center_lng DECIMAL(10,7) COMMENT '중심 경도',
    avg_price_30d BIGINT DEFAULT 0 COMMENT '최근 30일 평균 거래가 (만원)',
    avg_price_90d BIGINT DEFAULT 0 COMMENT '최근 90일 평균 거래가 (만원)',
    avg_price_365d BIGINT DEFAULT 0 COMMENT '최근 1년 평균 거래가 (만원)',
    deal_count_30d INT DEFAULT 0 COMMENT '최근 30일 거래 건수',
    deal_count_90d INT DEFAULT 0 COMMENT '최근 90일 거래 건수',
    deal_count_365d INT DEFAULT 0 COMMENT '최근 1년 거래 건수',
    apartment_count INT DEFAULT 0 COMMENT '아파트 단지 수',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_region (region_type, region_name, parent_name),
    INDEX idx_type (region_type),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='지역별 가격 캐시 테이블 (지도 줌레벨별 표시용)'
`;

// 시도별 데이터 집계 (apt_basic_info 주소에서 파싱)
const REFRESH_SIDO_SQL = `
INSERT INTO region_price_cache (
    region_type, region_name, parent_name,
    center_lat, center_lng, apartment_count
)
SELECT 
    'sido' as region_type,
    SUBSTRING_INDEX(kaptAddr, ' ', 1) as region_name,
    NULL as parent_name,
    AVG(latitude) as center_lat,
    AVG(longitude) as center_lng,
    COUNT(*) as apartment_count
FROM apt_basic_info
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY SUBSTRING_INDEX(kaptAddr, ' ', 1)
ON DUPLICATE KEY UPDATE
    center_lat = VALUES(center_lat),
    center_lng = VALUES(center_lng),
    apartment_count = VALUES(apartment_count),
    updated_at = CURRENT_TIMESTAMP
`;

// 시군구별 데이터 집계
const REFRESH_SIGUNGU_SQL = `
INSERT INTO region_price_cache (
    region_type, region_name, parent_name,
    center_lat, center_lng, apartment_count
)
SELECT 
    'sigungu' as region_type,
    SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 2), ' ', -1) as region_name,
    SUBSTRING_INDEX(kaptAddr, ' ', 1) as parent_name,
    AVG(latitude) as center_lat,
    AVG(longitude) as center_lng,
    COUNT(*) as apartment_count
FROM apt_basic_info
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY SUBSTRING_INDEX(kaptAddr, ' ', 1), SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 2), ' ', -1)
HAVING region_name IS NOT NULL AND region_name != ''
ON DUPLICATE KEY UPDATE
    center_lat = VALUES(center_lat),
    center_lng = VALUES(center_lng),
    apartment_count = VALUES(apartment_count),
    updated_at = CURRENT_TIMESTAMP
`;

// 읍면동별 데이터 집계
const REFRESH_DONG_SQL = `
INSERT INTO region_price_cache (
    region_type, region_name, parent_name,
    center_lat, center_lng, apartment_count
)
SELECT 
    'dong' as region_type,
    dong_name as region_name,
    CONCAT(sido, ' ', sigungu) as parent_name,
    AVG(lat) as center_lat,
    AVG(lng) as center_lng,
    COUNT(*) as apartment_count
FROM (
    SELECT 
        SUBSTRING_INDEX(kaptAddr, ' ', 1) as sido,
        SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 2), ' ', -1) as sigungu,
        SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) as dong_name,
        latitude as lat,
        longitude as lng
    FROM apt_basic_info
    WHERE latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) NOT LIKE '%-%'
      AND SUBSTRING_INDEX(SUBSTRING_INDEX(kaptAddr, ' ', 3), ' ', -1) != ''
) sub
GROUP BY sido, sigungu, dong_name
ON DUPLICATE KEY UPDATE
    center_lat = VALUES(center_lat),
    center_lng = VALUES(center_lng),
    apartment_count = VALUES(apartment_count),
    updated_at = CURRENT_TIMESTAMP
`;

// 시도별 가격 업데이트 (전체 시도 평균)
const UPDATE_SIDO_PRICES_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN d.dealAmount END)) as avg30,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN d.dealAmount END)) as avg90,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN d.dealAmount END)) as avg365,
        SUM(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as deals30
    FROM apt_deal_info d
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1 FROM apt_list) l ON d.sggCd = l.sggCode
    WHERE (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY l.as1
) p ON rc.region_type = 'sido' AND rc.region_name COLLATE utf8mb4_unicode_ci = p.sido COLLATE utf8mb4_unicode_ci
SET 
    rc.avg_price_30d = COALESCE(p.avg30, 0),
    rc.avg_price_90d = COALESCE(p.avg90, 0),
    rc.avg_price_365d = COALESCE(p.avg365, 0),
    rc.deal_count_30d = COALESCE(p.deals30, 0)
`;

// 시군구별 가격 업데이트
const UPDATE_SIGUNGU_PRICES_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        l.as2 as sigungu,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN d.dealAmount END)) as avg30,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN d.dealAmount END)) as avg90,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN d.dealAmount END)) as avg365,
        SUM(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as deals30
    FROM apt_deal_info d
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2 FROM apt_list) l ON d.sggCd = l.sggCode
    WHERE (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY l.as1, l.as2
) p ON rc.region_type = 'sigungu' 
    AND rc.region_name COLLATE utf8mb4_unicode_ci = p.sigungu COLLATE utf8mb4_unicode_ci 
    AND rc.parent_name COLLATE utf8mb4_unicode_ci = p.sido COLLATE utf8mb4_unicode_ci
SET 
    rc.avg_price_30d = COALESCE(p.avg30, 0),
    rc.avg_price_90d = COALESCE(p.avg90, 0),
    rc.avg_price_365d = COALESCE(p.avg365, 0),
    rc.deal_count_30d = COALESCE(p.deals30, 0)
`;

// 읍면동별 가격 업데이트
const UPDATE_DONG_PRICES_SQL = `
UPDATE region_price_cache rc
JOIN (
    SELECT 
        l.as1 as sido,
        l.as2 as sigungu,
        d.umdNm as dong,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN d.dealAmount END)) as avg30,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN d.dealAmount END)) as avg90,
        ROUND(AVG(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN d.dealAmount END)) as avg365,
        SUM(CASE WHEN d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as deals30
    FROM apt_deal_info d
    JOIN (SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2 FROM apt_list) l ON d.sggCd = l.sggCode
    WHERE (d.cdealType IS NULL OR d.cdealType = '')
    GROUP BY l.as1, l.as2, d.umdNm
) p ON rc.region_type = 'dong' 
    AND rc.region_name COLLATE utf8mb4_unicode_ci = p.dong COLLATE utf8mb4_unicode_ci 
    AND rc.parent_name COLLATE utf8mb4_unicode_ci = CONCAT(p.sido, ' ', p.sigungu) COLLATE utf8mb4_unicode_ci
SET 
    rc.avg_price_30d = COALESCE(p.avg30, 0),
    rc.avg_price_90d = COALESCE(p.avg90, 0),
    rc.avg_price_365d = COALESCE(p.avg365, 0),
    rc.deal_count_30d = COALESCE(p.deals30, 0)
`;

export async function refreshRegionCache() {
    log('📊 지역별 가격 캐시 갱신 시작...');
    const startTime = Date.now();

    try {
        // 1. 시도별 데이터 적재
        await executeQuery(REFRESH_SIDO_SQL);
        log('   - 시도별 데이터 적재 완료');

        // 2. 시군구별 데이터 적재
        await executeQuery(REFRESH_SIGUNGU_SQL);
        log('   - 시군구별 데이터 적재 완료');

        // 3. 읍면동별 데이터 적재
        await executeQuery(REFRESH_DONG_SQL);
        log('   - 읍면동별 데이터 적재 완료');

        // 4. 가격 정보 업데이트 (레벨별 별도 처리)
        await executeQuery(UPDATE_SIDO_PRICES_SQL);
        log('   - 시도 가격 정보 업데이트 완료');

        await executeQuery(UPDATE_SIGUNGU_PRICES_SQL);
        log('   - 시군구 가격 정보 업데이트 완료');

        await executeQuery(UPDATE_DONG_PRICES_SQL);
        log('   - 읍면동 가격 정보 업데이트 완료');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logSuccess(`지역별 가격 캐시 갱신 완료 (${elapsed}초)`);
        return true;
    } catch (error) {
        logError('지역별 캐시 갱신 실패:', error.message);
        return false;
    }
}

async function main() {
    logSection('지역별 가격 캐시 테이블 생성');

    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 1. 테이블 생성
        log('📋 테이블 생성 중...');
        await executeQuery(CREATE_TABLE_SQL);
        logSuccess('region_price_cache 테이블 생성 완료');

        // 2. 캐시 데이터 갱신
        await refreshRegionCache();

        // 3. 통계 확인
        const stats = await executeQuery(`
            SELECT 
                region_type,
                COUNT(*) as count,
                SUM(CASE WHEN avg_price_365d > 0 THEN 1 ELSE 0 END) as with_price,
                SUM(apartment_count) as total_apartments
            FROM region_price_cache
            GROUP BY region_type
        `);

        log(`\n📈 캐시 통계:`);
        for (const row of stats) {
            log(`   - ${row.region_type}: ${row.count.toLocaleString()}개 지역, 가격정보 ${row.with_price?.toLocaleString() || 0}개, 아파트 ${row.total_apartments?.toLocaleString() || 0}개`);
        }

    } catch (error) {
        logError('캐시 생성 실패:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }

    logSuccess('\n✅ 지역별 가격 캐시 생성 완료!');
}

// 직접 실행 시에만 main 함수 실행
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        logError('스크립트 실행 실패:', error);
        process.exit(1);
    });
}
