/**
 * 아파트 사이드바 캐시 생성 스크립트 (고속 배치 버전)
 * 개별 쿼리 대신 한 번에 처리
 */

import 'dotenv/config';
import { executeQuery, closeConnection } from './utils/db.js';

// 테이블 생성 (컬럼 추가)
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS apt_sidebar_cache (
        kapt_code VARCHAR(20) PRIMARY KEY,
        apt_name VARCHAR(100),
        price_by_area JSON COMMENT '매매 면적별 평균가',
        rent_price_by_area JSON COMMENT '전세 면적별 평균가',
        recent_deals JSON COMMENT '최근 매매 내역',
        recent_rents JSON COMMENT '최근 전월세 내역',
        price_trend JSON COMMENT '매매 가격 추이',
        rent_trend JSON COMMENT '전세 가격 추이',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_apt_name (apt_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

// 1. 면적별 평균가 (실제 전용면적 기준)
async function updatePriceByArea() {
    console.log('📊 면적별 평균가 계산 중...');

    // 먼저 apt_basic_info에서 기본 데이터 삽입
    await executeQuery(`
        INSERT IGNORE INTO apt_sidebar_cache (kapt_code, apt_name)
        SELECT kaptCode, kaptName FROM apt_basic_info
    `);

    // 실제 면적(㎡)별 평균가 계산 후 업데이트 (정렬은 프론트엔드에서)
    const areaData = await executeQuery(`
        SELECT 
            kapt_code,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'area', area,
                    'avgPrice', avgPrice,
                    'count', dealCount
                )
            ) as price_by_area
        FROM (
            SELECT 
                anm.kapt_code,
                CONCAT(ROUND(d.excluUseAr), '㎡') as area,
                ROUND(AVG(d.dealAmount)) as avgPrice,
                COUNT(*) as dealCount
            FROM apt_name_mapping anm
            INNER JOIN apt_deal_info d ON anm.deal_apt_name = d.aptNm
            WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
              AND (d.cdealType IS NULL OR d.cdealType = '')
            GROUP BY anm.kapt_code, area
        ) sub
        WHERE dealCount >= 1
        GROUP BY kapt_code
    `);

    console.log(`  - ${areaData.length}개 단지 면적별 가격 데이터`);

    // 배치 업데이트
    for (const row of areaData) {
        await executeQuery(`
            UPDATE apt_sidebar_cache SET price_by_area = ? WHERE kapt_code = ?
        `, [JSON.stringify(row.price_by_area), row.kapt_code]);
    }

    console.log('✅ 면적별 평균가 완료');
}

// 1-2. 전세 면적별 평균가 (1년, 월세 제외)
async function updateRentPriceByArea() {
    console.log('📊 전세 면적별 평균가 계산 중...');

    const areaData = await executeQuery(`
        SELECT 
            kapt_code,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'area', area,
                    'avgDeposit', avgDeposit,
                    'count', dealCount
                )
            ) as rent_price_by_area
        FROM (
            SELECT 
                anm.kapt_code,
                CONCAT(ROUND(r.excluUseAr), '㎡') as area,
                ROUND(AVG(r.deposit)) as avgDeposit,
                COUNT(*) as dealCount
            FROM apt_name_mapping anm
            INNER JOIN apt_rent_info r ON r.aptNm COLLATE utf8mb4_unicode_ci = anm.deal_apt_name COLLATE utf8mb4_unicode_ci
            WHERE CONCAT(r.dealYear, '-', LPAD(r.dealMonth, 2, '0')) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 YEAR), '%Y-%m')
              AND r.monthlyRent = 0
            GROUP BY anm.kapt_code, area
        ) sub
        WHERE dealCount >= 1
        GROUP BY kapt_code
    `);

    console.log(`  - ${areaData.length}개 단지 전세 면적별 가격 데이터`);

    for (const row of areaData) {
        await executeQuery(`
            UPDATE apt_sidebar_cache SET rent_price_by_area = ? WHERE kapt_code = ?
        `, [JSON.stringify(row.rent_price_by_area), row.kapt_code]);
    }

    console.log('✅ 전세 면적별 평균가 완료');
}

// 2. 가격 추이 - 실제 면적(㎡)별로 구분 (recharts Area 차트용)
async function updatePriceTrend() {
    console.log('📈 면적별 가격 추이 계산 중...');

    // 실제 전용면적(㎡)별로 월별 평균가를 계산
    const trendData = await executeQuery(`
        SELECT 
            anm.kapt_code,
        trend.month,
        trend.areaType,
        trend.avgPrice,
        trend.dealCount
        FROM apt_name_mapping anm
        INNER JOIN(
            SELECT 
                aptNm,
            DATE_FORMAT(dealDate, '%Y-%m') as month,
            CONCAT(ROUND(excluUseAr), '㎡') as areaType,
            ROUND(AVG(dealAmount)) as avgPrice,
            COUNT(*) as dealCount
            FROM apt_deal_info
            WHERE dealDate >= DATE_SUB(CURDATE(), INTERVAL 36 MONTH)
              AND(cdealType IS NULL OR cdealType = '')
            GROUP BY aptNm, DATE_FORMAT(dealDate, '%Y-%m'), CONCAT(ROUND(excluUseAr), '㎡')
            ORDER BY aptNm, month, areaType
        ) trend ON anm.deal_apt_name = trend.aptNm
        ORDER BY anm.kapt_code, trend.month, trend.areaType
        `);

    console.log(`  - ${trendData.length}개 가격 추이 레코드`);

    // kapt_code별로 그룹화하고 recharts용 데이터 구조로 변환
    const groupedData = {};
    for (const row of trendData) {
        if (!groupedData[row.kapt_code]) {
            groupedData[row.kapt_code] = {};
        }
        if (!groupedData[row.kapt_code][row.month]) {
            groupedData[row.kapt_code][row.month] = { month: row.month };
        }
        groupedData[row.kapt_code][row.month][row.areaType] = row.avgPrice;
    }

    // 배열로 변환
    let updatedCount = 0;
    for (const [kaptCode, monthData] of Object.entries(groupedData)) {
        const priceTrend = Object.values(monthData).sort((a, b) => a.month.localeCompare(b.month));
        await executeQuery(`
            UPDATE apt_sidebar_cache SET price_trend = ? WHERE kapt_code = ?
        `, [JSON.stringify(priceTrend), kaptCode]);
        updatedCount++;
    }

    console.log(`  - ${updatedCount}개 단지 업데이트 완료`);
    console.log('✅ 면적별 가격 추이 완료');
}

// 3. 전세 추이 (면적별로 계산 - 매매 추이와 동일한 방식)
async function updateRentTrend() {
    console.log('📉 전세 추이 계산 중 (면적별)...');

    const trendData = await executeQuery(`
        SELECT 
            anm.kapt_code,
            trend.month,
            trend.areaType,
            trend.avgDeposit
        FROM apt_name_mapping anm
        INNER JOIN (
            SELECT 
                aptNm COLLATE utf8mb4_unicode_ci as aptNm,
                CONCAT(dealYear, '-', LPAD(dealMonth, 2, '0')) as month,
                CONCAT(ROUND(excluUseAr), '㎡') as areaType,
                ROUND(AVG(deposit)) as avgDeposit
            FROM apt_rent_info
            WHERE monthlyRent = 0
              AND CONCAT(dealYear, '-', LPAD(dealMonth, 2, '0')) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 36 MONTH), '%Y-%m')
            GROUP BY aptNm, month, ROUND(excluUseAr)
        ) trend ON anm.deal_apt_name COLLATE utf8mb4_unicode_ci = trend.aptNm
        ORDER BY anm.kapt_code, trend.month, trend.areaType
    `);

    console.log(`  - ${trendData.length}개 전세 추이 레코드`);

    // kapt_code별로 그룹화하고 recharts용 데이터 구조로 변환
    const groupedData = {};
    for (const row of trendData) {
        if (!groupedData[row.kapt_code]) {
            groupedData[row.kapt_code] = {};
        }
        if (!groupedData[row.kapt_code][row.month]) {
            groupedData[row.kapt_code][row.month] = { month: row.month };
        }
        groupedData[row.kapt_code][row.month][row.areaType] = row.avgDeposit;
    }

    // 배열로 변환하고 DB 업데이트
    let updatedCount = 0;
    for (const [kaptCode, monthData] of Object.entries(groupedData)) {
        const rentTrend = Object.values(monthData).sort((a, b) => a.month.localeCompare(b.month));
        await executeQuery(`
            UPDATE apt_sidebar_cache SET rent_trend = ? WHERE kapt_code = ?
        `, [JSON.stringify(rentTrend), kaptCode]);
        updatedCount++;
    }

    console.log(`  - ${updatedCount}개 단지 업데이트 완료`);
    console.log('✅ 전세 추이 완료');
}

// 4. 최근 전월세 (배치 처리 - 전체 아파트)
async function updateRecentRents() {
    console.log('🏠 최근 전월세 계산 중 (배치 처리)...');

    // 한 번의 쿼리로 모든 아파트의 최근 5건 전월세 조회
    const rentData = await executeQuery(`
        SELECT 
            kapt_code,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'deposit', deposit,
                'monthlyRent', monthlyRent,
                'area', area,
                'floor', floor,
                'date', date,
                'type', type
            )
        ) as recent_rents
        FROM(
            SELECT 
                anm.kapt_code,
            r.deposit,
            r.monthlyRent,
            r.excluUseAr as area,
            r.floor,
            CONCAT(r.dealYear, '-', LPAD(r.dealMonth, 2, '0'), '-', LPAD(r.dealDay, 2, '0')) as date,
            IF(r.monthlyRent > 0, '월세', '전세') as type,
            ROW_NUMBER() OVER(PARTITION BY anm.kapt_code ORDER BY r.dealYear DESC, r.dealMonth DESC, r.dealDay DESC) as rn
            FROM apt_name_mapping anm
            INNER JOIN apt_rent_info r ON r.aptNm COLLATE utf8mb4_unicode_ci = anm.deal_apt_name COLLATE utf8mb4_unicode_ci
            WHERE CONCAT(r.dealYear, '-', LPAD(r.dealMonth, 2, '0')) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m')
        ) sub
        WHERE rn <= 5
        GROUP BY kapt_code
        `);

    console.log(`  - ${rentData.length}개 단지 전월세 데이터 조회 완료`);

    // 배치 업데이트
    let updated = 0;
    for (const row of rentData) {
        await executeQuery(`
            UPDATE apt_sidebar_cache SET recent_rents = ? WHERE kapt_code = ?
        `, [JSON.stringify(row.recent_rents), row.kapt_code]);
        updated++;
        if (updated % 2000 === 0) {
            console.log(`  - ${updated} / ${rentData.length} 업데이트 완료`);
        }
    }

    console.log(`✅ 최근 전월세 완료(${rentData.length}개 단지)`);
}

// 6. 최근 매매 내역 (배치 처리 - 6개월)
async function updateRecentDeals() {
    console.log('🏠 최근 매매 계산 중 (배치 처리)...');

    const dealData = await executeQuery(`
        SELECT 
            kapt_code,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'price', price,
                    'area', area,
                    'floor', floor,
                    'date', date
                )
            ) as recent_deals
        FROM (
            SELECT 
                anm.kapt_code,
                d.dealAmount as price,
                ROUND(d.excluUseAr) as area,
                d.floor,
                DATE_FORMAT(d.dealDate, '%Y-%m-%d') as date,
                ROW_NUMBER() OVER (PARTITION BY anm.kapt_code ORDER BY d.dealDate DESC) as rn
            FROM apt_name_mapping anm
            INNER JOIN apt_deal_info d ON d.aptNm = anm.deal_apt_name
            WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
              AND (d.cdealType IS NULL OR d.cdealType = '')
        ) sub
        WHERE rn <= 5
        GROUP BY kapt_code
    `);

    console.log(`  - ${dealData.length}개 단지 매매 데이터 조회 완료`);

    let updated = 0;
    for (const row of dealData) {
        await executeQuery(`
            UPDATE apt_sidebar_cache SET recent_deals = ? WHERE kapt_code = ?
        `, [JSON.stringify(row.recent_deals), row.kapt_code]);
        updated++;
        if (updated % 2000 === 0) {
            console.log(`  - ${updated}/${dealData.length} 업데이트 완료`);
        }
    }

    console.log(`✅ 최근 매매 완료 (${dealData.length}개 단지)`);
}

// 메인 함수
export async function refreshSidebarCache() {
    console.log('🔄 사이드바 캐시 갱신 시작...');
    const startTime = Date.now();

    try {
        await executeQuery(CREATE_TABLE_SQL);

        await updatePriceByArea();       // 매매 면적별 평균가
        await updateRentPriceByArea();   // 전세 면적별 평균가 (신규)
        await updatePriceTrend();        // 매매 가격 추이
        await updateRentTrend();         // 전세 가격 추이
        await updateRecentDeals();       // 최근 매매 (신규)
        await updateRecentRents();       // 최근 전월세

        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        console.log(`✅ 사이드바 캐시 갱신 완료 (${elapsed}분)`);

        const stats = await executeQuery('SELECT COUNT(*) as cnt FROM apt_sidebar_cache WHERE price_by_area IS NOT NULL');
        console.log(`📊 가격 정보 있는 단지: ${stats[0].cnt}개`);

    } catch (error) {
        console.error('❌ 사이드바 캐시 갱신 실패:', error);
        throw error;
    }
}

// 직접 실행
if (process.argv[1].includes('create_sidebar_cache')) {
    refreshSidebarCache()
        .then(() => closeConnection())
        .catch(err => {
            console.error(err);
            closeConnection();
            process.exit(1);
        });
}
