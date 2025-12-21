/**
 * apt_search_index의 주소 기반 매핑을 사용하여 가격 캐시 업데이트
 * 
 * apt_name_mapping에 없지만 apt_search_index에 kapt_code가 있는 아파트의
 * 가격을 apt_price_cache에 반영합니다.
 * 
 * 실행: node src/scripts/data-loader/15_update_price_cache_from_search_index.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== apt_search_index 기반 가격 캐시 업데이트 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 현재 가격 없는 아파트 수 확인
        const [before] = await executeQuery(`
            SELECT COUNT(*) as cnt FROM apt_price_cache 
            WHERE (avg_price_365d = 0 OR avg_price_365d IS NULL) 
              AND (last_deal_price = 0 OR last_deal_price IS NULL)
        `);
        console.log(`가격 없는 아파트 (업데이트 전): ${before.cnt.toLocaleString()}`);

        // apt_search_index의 kapt_code를 사용하여 가격 캐시 업데이트
        console.log('\n📊 apt_search_index 기반 가격 업데이트 중...');
        const startTime = Date.now();

        // apt_search_index에서 kapt_code가 있는 것만 사용하여 가격 정보 수집
        const result = await executeQuery(`
            UPDATE apt_price_cache pc
            JOIN (
                SELECT 
                    s.kapt_code,
                    d.avg_price,
                    d.deal_count,
                    d.min_price,
                    d.max_price,
                    d.latest_date,
                    d.last_price,
                    d.last_date
                FROM apt_search_index s
                JOIN (
                    SELECT 
                        aptNm,
                        umdNm,
                        ROUND(AVG(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN dealAmount END)) as avg_price,
                        COUNT(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN 1 END) as deal_count,
                        MIN(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN dealAmount END) as min_price,
                        MAX(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN dealAmount END) as max_price,
                        MAX(CASE WHEN dealDate >= DATE_SUB(CURDATE(), INTERVAL 365 DAY) THEN dealDate END) as latest_date,
                        MAX(dealAmount) as last_price,
                        MAX(dealDate) as last_date
                    FROM apt_deal_info
                    WHERE (cdealType IS NULL OR cdealType = '')
                    GROUP BY aptNm, umdNm
                ) d ON s.aptNm COLLATE utf8mb4_unicode_ci = d.aptNm COLLATE utf8mb4_unicode_ci
                   AND s.umdNm COLLATE utf8mb4_unicode_ci = d.umdNm COLLATE utf8mb4_unicode_ci
                WHERE s.kapt_code IS NOT NULL 
                  AND s.kapt_code != 'UNMAPPED'
            ) idx ON pc.kapt_code COLLATE utf8mb4_unicode_ci = idx.kapt_code COLLATE utf8mb4_unicode_ci
            SET 
                pc.avg_price_365d = COALESCE(NULLIF(pc.avg_price_365d, 0), idx.avg_price, 0),
                pc.deal_count_365d = COALESCE(NULLIF(pc.deal_count_365d, 0), idx.deal_count, 0),
                pc.min_price_365d = COALESCE(NULLIF(pc.min_price_365d, 0), idx.min_price, 0),
                pc.max_price_365d = COALESCE(NULLIF(pc.max_price_365d, 0), idx.max_price, 0),
                pc.latest_deal_date = COALESCE(pc.latest_deal_date, idx.latest_date),
                pc.last_deal_price = COALESCE(NULLIF(pc.last_deal_price, 0), idx.last_price, 0),
                pc.last_deal_date = COALESCE(pc.last_deal_date, idx.last_date),
                pc.updated_at = CURRENT_TIMESTAMP
            WHERE (pc.avg_price_365d = 0 OR pc.avg_price_365d IS NULL)
               OR (pc.last_deal_price = 0 OR pc.last_deal_price IS NULL)
        `);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ 업데이트 완료 (${elapsed}초)`);
        console.log(`   변경된 행: ${result.affectedRows || result.changedRows || 0}`);

        // 업데이트 후 확인
        const [after] = await executeQuery(`
            SELECT COUNT(*) as cnt FROM apt_price_cache 
            WHERE (avg_price_365d = 0 OR avg_price_365d IS NULL) 
              AND (last_deal_price = 0 OR last_deal_price IS NULL)
        `);
        console.log(`\n가격 없는 아파트 (업데이트 후): ${after.cnt.toLocaleString()}`);
        console.log(`개선된 수: ${(before.cnt - after.cnt).toLocaleString()}`);

        // 특정 아파트 확인 (브라운스톤2차)
        const [check] = await executeQuery(`
            SELECT kapt_code, kapt_name, avg_price_365d, last_deal_price
            FROM apt_price_cache
            WHERE kapt_code = 'A42303002'
        `);
        console.log('\n🔍 브라운스톤2차 확인:', check);

    } catch (error) {
        console.error('오류:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }

    console.log('\n✅ 완료!');
}

main().catch(error => {
    console.error('스크립트 실행 실패:', error);
    process.exit(1);
});
