import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

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
                aptNm,
                month,
                areaType,
                avgDeposit
            FROM (
                SELECT 
                    aptNm COLLATE utf8mb4_unicode_ci as aptNm,
                    CONCAT(dealYear, '-', LPAD(dealMonth, 2, '0')) as month,
                    CONCAT(ROUND(excluUseAr), '㎡') as areaType,
                    ROUND(AVG(deposit)) as avgDeposit
                FROM apt_rent_info
                WHERE monthlyRent = 0
                  AND CONCAT(dealYear, '-', LPAD(dealMonth, 2, '0')) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 36 MONTH), '%Y-%m')
                GROUP BY aptNm, CONCAT(dealYear, '-', LPAD(dealMonth, 2, '0')), CONCAT(ROUND(excluUseAr), '㎡')
            ) sub
        ) trend ON anm.deal_apt_name COLLATE utf8mb4_unicode_ci = trend.aptNm
        ORDER BY anm.kapt_code, trend.month, trend.areaType
    `);

    console.log(`  - ${trendData.length}개 전세 추이 레코드`);

    const groupedData = {};
    for (const row of trendData) {
        if (!groupedData[row.kapt_code]) groupedData[row.kapt_code] = {};
        if (!groupedData[row.kapt_code][row.month]) groupedData[row.kapt_code][row.month] = { month: row.month };
        groupedData[row.kapt_code][row.month][row.areaType] = row.avgDeposit;
    }

    let updatedCount = 0;
    for (const [kaptCode, monthData] of Object.entries(groupedData)) {
        const rentTrend = Object.values(monthData).sort((a, b) => a.month.localeCompare(b.month));
        await executeQuery('UPDATE apt_sidebar_cache SET rent_trend = ? WHERE kapt_code = ?', [JSON.stringify(rentTrend), kaptCode]);
        updatedCount++;
        if (updatedCount % 2000 === 0) console.log(`  - ${updatedCount} 업데이트 완료`);
    }

    console.log(`  - 총 ${updatedCount}개 단지 업데이트 완료`);
    console.log('✅ 전세 추이 완료');
    await closeConnection();
}

updateRentTrend();
