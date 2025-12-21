/**
 * 단지별로 분리된 거래 데이터를 K-apt 통합 단지에 집계
 * 
 * 예: 마포래미안푸르지오1~4단지 → 마포래미안푸르지오
 * 
 * 실행: node src/scripts/data-loader/16_aggregate_danji_prices.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== 단지별 거래 데이터 집계 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 가격 없는 아파트 중 실거래에 단지별 데이터가 있는 것 찾기
        const noPriceApts = await executeQuery(`
            SELECT pc.kapt_code, pc.kapt_name, b.kaptAddr
            FROM apt_price_cache pc
            JOIN apt_basic_info b ON pc.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE (pc.avg_price_365d = 0 OR pc.avg_price_365d IS NULL) 
              AND (pc.last_deal_price = 0 OR pc.last_deal_price IS NULL)
              AND b.kaptdaCnt >= 100
            ORDER BY b.kaptdaCnt DESC
        `);

        console.log(`분석할 아파트: ${noPriceApts.length}\n`);

        let updated = 0;
        let checked = 0;

        for (const apt of noPriceApts) {
            checked++;

            // 주소에서 동 추출
            const addrParts = apt.kaptAddr.split(' ');
            let dong = '';
            for (const part of addrParts) {
                if (part.endsWith('동') || part.endsWith('읍') || part.endsWith('면') || part.endsWith('리')) {
                    dong = part;
                    break;
                }
            }

            if (!dong) continue;

            // K-apt 이름에서 숫자/단지 제거한 기본 이름 추출
            const baseName = apt.kapt_name
                .replace(/\d+단지/g, '')
                .replace(/\d+차/g, '')
                .replace(/\s+/g, '')
                .replace(/아파트$/g, '')
                .trim();

            if (baseName.length < 3) continue;

            // 해당 동에서 유사한 이름의 모든 거래 집계
            const aggregated = await executeQuery(`
                SELECT 
                    ROUND(AVG(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN dealAmount END)) as avg_price,
                    COUNT(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN 1 END) as deal_count,
                    MAX(dealAmount) as last_price,
                    MAX(dealDate) as last_date
                FROM apt_deal_info
                WHERE umdNm = ?
                  AND REPLACE(REPLACE(aptNm, ' ', ''), '아파트', '') LIKE CONCAT(?, '%')
                  AND (cdealType IS NULL OR cdealType = '')
            `, [dong, baseName]);

            if (aggregated.length > 0 && aggregated[0].avg_price > 0) {
                const data = aggregated[0];

                await executeQuery(`
                    UPDATE apt_price_cache
                    SET avg_price_365d = ?,
                        deal_count_365d = ?,
                        last_deal_price = ?,
                        last_deal_date = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE kapt_code = ?
                `, [data.avg_price, data.deal_count, data.last_price, data.last_date, apt.kapt_code]);

                updated++;
                if (updated <= 10) {
                    console.log(`✅ ${apt.kapt_name} → ${data.deal_count}건, 평균 ${Math.round(data.avg_price / 10000)}억`);
                }
            }

            if (checked % 500 === 0) {
                console.log(`   처리: ${checked}/${noPriceApts.length} | 업데이트: ${updated}`);
            }
        }

        console.log(`\n=== 완료 ===`);
        console.log(`처리: ${checked}`);
        console.log(`업데이트: ${updated}`);

        // 최종 확인
        const [after] = await executeQuery(`
            SELECT COUNT(*) as cnt FROM apt_price_cache 
            WHERE (avg_price_365d = 0 OR avg_price_365d IS NULL) 
              AND (last_deal_price = 0 OR last_deal_price IS NULL)
        `);
        console.log(`\n가격 없는 아파트 (최종): ${after.cnt.toLocaleString()}`);

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
