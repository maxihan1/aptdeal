/**
 * 별칭(Alias) 테이블을 사용하여 가격 캐시 업데이트
 * 
 * K-apt 이름과 실거래 이름이 다른 경우 별칭 매핑을 통해 가격 연결
 * 
 * 실행: node src/scripts/data-loader/18_update_price_by_alias.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== 별칭 기반 가격 캐시 업데이트 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 별칭 테이블 데이터 확인
        const aliases = await executeQuery('SELECT * FROM apt_name_alias');
        console.log(`별칭 개수: ${aliases.length}\n`);

        let updated = 0;

        for (const alias of aliases) {
            // K-apt에서 해당 아파트 찾기
            const kapt = await executeQuery(`
                SELECT kaptCode FROM apt_basic_info
                WHERE kaptName LIKE CONCAT('%', ?, '%')
                LIMIT 1
            `, [alias.kapt_name]);

            if (kapt.length === 0) {
                console.log(`❌ K-apt에서 찾을 수 없음: ${alias.kapt_name}`);
                continue;
            }

            const kaptCode = kapt[0].kaptCode;

            // 실거래에서 가격 조회 - 정확 일치 사용
            let dealQuery = `
                SELECT 
                    ROUND(AVG(dealAmount)) as avg_price,
                    COUNT(*) as deal_count,
                    MAX(dealAmount) as last_price,
                    MAX(dealDate) as last_date
                FROM apt_deal_info
                WHERE aptNm = ?
                  AND (cdealType IS NULL OR cdealType = '')
            `;
            const params = [alias.deal_name];

            if (alias.umd_nm) {
                dealQuery += ` AND umdNm = ?`;
                params.push(alias.umd_nm);
            }

            const price = await executeQuery(dealQuery, params);

            if (price.length > 0 && price[0].avg_price > 0) {
                // 가격 캐시 업데이트
                await executeQuery(`
                    UPDATE apt_price_cache
                    SET avg_price_365d = CASE WHEN avg_price_365d = 0 THEN ? ELSE avg_price_365d END,
                        deal_count_365d = CASE WHEN deal_count_365d = 0 THEN ? ELSE deal_count_365d END,
                        last_deal_price = CASE WHEN last_deal_price = 0 OR last_deal_price IS NULL THEN ? ELSE last_deal_price END,
                        last_deal_date = CASE WHEN last_deal_date IS NULL THEN ? ELSE last_deal_date END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE kapt_code = ?
                `, [price[0].avg_price, price[0].deal_count, price[0].last_price, price[0].last_date, kaptCode]);

                console.log(`✅ ${alias.kapt_name} → ${alias.deal_name}: 평균 ${Math.round(price[0].avg_price / 10000)}억 (${price[0].deal_count}건)`);
                updated++;
            } else {
                console.log(`⚠️ 거래 데이터 없음: ${alias.deal_name}`);
            }
        }

        console.log(`\n=== 완료 ===`);
        console.log(`업데이트: ${updated}/${aliases.length}`);

        // 최종 확인
        const [after] = await executeQuery(`
            SELECT COUNT(*) as cnt FROM apt_price_cache 
            WHERE (avg_price_365d = 0 OR avg_price_365d IS NULL) 
              AND (last_deal_price = 0 OR last_deal_price IS NULL)
        `);
        console.log(`가격 없음 (최종): ${after.cnt.toLocaleString()}`);

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
