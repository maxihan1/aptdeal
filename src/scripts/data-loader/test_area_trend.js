/**
 * 특정 아파트의 면적별 가격 추이 데이터 생성 테스트
 */

import 'dotenv/config';
import { executeQuery, closeConnection } from './utils/db.js';

const TEST_KAPT_CODE = 'A10021633'; // 삼성아파트 (구미시)

async function test() {
    console.log(`\n테스트 아파트: ${TEST_KAPT_CODE}`);

    // 1. apt_name_mapping에서 deal_apt_name 조회
    const mapping = await executeQuery(`
        SELECT deal_apt_name FROM apt_name_mapping WHERE kapt_code = ?
    `, [TEST_KAPT_CODE]);

    if (mapping.length === 0) {
        console.log('매핑 없음');
        await closeConnection();
        return;
    }

    const aptName = mapping[0].deal_apt_name;
    console.log(`deal_apt_name: ${aptName}`);

    // 2. 면적별 월별 가격 추이 조회
    const trendData = await executeQuery(`
        SELECT 
            DATE_FORMAT(dealDate, '%Y-%m') as month,
            CASE 
                WHEN excluUseAr < 60 THEN '소형'
                WHEN excluUseAr < 85 THEN '중형'
                WHEN excluUseAr < 115 THEN '중대형'
                ELSE '대형'
            END as areaType,
            ROUND(AVG(dealAmount)) as avgPrice,
            COUNT(*) as dealCount
        FROM apt_deal_info
        WHERE aptNm = ?
          AND dealDate >= DATE_SUB(CURDATE(), INTERVAL 36 MONTH)
          AND (cdealType IS NULL OR cdealType = '')
        GROUP BY month, areaType
        ORDER BY month, areaType
    `, [aptName]);

    console.log(`\n조회된 레코드: ${trendData.length}개`);
    console.log('\n샘플 데이터:');
    trendData.slice(0, 10).forEach(row => {
        console.log(`  ${row.month} ${row.areaType}: ${row.avgPrice}만원 (${row.dealCount}건)`);
    });

    // 3. recharts용 데이터 구조로 변환
    const monthData = {};
    for (const row of trendData) {
        if (!monthData[row.month]) {
            monthData[row.month] = { month: row.month };
        }
        monthData[row.month][row.areaType] = row.avgPrice;
    }

    const priceTrend = Object.values(monthData).sort((a, b) => a.month.localeCompare(b.month));

    console.log('\n변환된 데이터 (최근 5개월):');
    priceTrend.slice(-5).forEach(row => {
        console.log(JSON.stringify(row));
    });

    // 4. 캐시 업데이트
    await executeQuery(`
        UPDATE apt_sidebar_cache SET price_trend = ? WHERE kapt_code = ?
    `, [JSON.stringify(priceTrend), TEST_KAPT_CODE]);

    console.log('\n✅ 캐시 업데이트 완료');

    await closeConnection();
}

test().catch(console.error);
