import 'dotenv/config';
import { executeQuery, closeConnection } from './utils/db.js';

async function find() {
    // price_trend가 있는 아파트 중 가격 데이터도 있는 아파트 1개 찾기
    const result = await executeQuery(`
        SELECT sc.kapt_code, sc.apt_name, ab.kaptAddr, pc.avg_price_365d
        FROM apt_sidebar_cache sc
        JOIN apt_basic_info ab ON ab.kaptCode COLLATE utf8mb4_unicode_ci = sc.kapt_code COLLATE utf8mb4_unicode_ci
        LEFT JOIN apt_price_cache pc ON pc.kapt_code COLLATE utf8mb4_unicode_ci = sc.kapt_code COLLATE utf8mb4_unicode_ci
        WHERE sc.price_trend IS NOT NULL AND pc.avg_price_365d > 0
        ORDER BY pc.deal_count_365d DESC
        LIMIT 3
    `);

    console.log('=== 차트 데이터 있는 아파트 ===');
    for (const row of result) {
        console.log(`\nkapt_code: ${row.kapt_code}`);
        console.log(`이름: ${row.apt_name}`);
        console.log(`주소: ${row.kaptAddr}`);
        console.log(`평균가: ${row.avg_price_365d}만원`);
    }

    await closeConnection();
}

find().catch(console.error);
