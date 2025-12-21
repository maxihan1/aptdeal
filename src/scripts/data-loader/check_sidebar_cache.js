/**
 * 사이드바 캐시 상태 확인 스크립트
 */

import 'dotenv/config';
import { executeQuery, closeConnection } from './utils/db.js';

async function check() {
    console.log('=== apt_name_mapping ===');
    const mapping = await executeQuery('SELECT COUNT(*) as cnt FROM apt_name_mapping');
    console.log('Total mappings:', mapping[0].cnt);

    console.log('\n=== apt_sidebar_cache ===');
    const sidebar = await executeQuery('SELECT COUNT(*) as total FROM apt_sidebar_cache');
    console.log('Total rows:', sidebar[0].total);

    const priceTrend = await executeQuery('SELECT COUNT(*) as cnt FROM apt_sidebar_cache WHERE price_trend IS NOT NULL');
    console.log('With price_trend:', priceTrend[0].cnt);

    const priceByArea = await executeQuery('SELECT COUNT(*) as cnt FROM apt_sidebar_cache WHERE price_by_area IS NOT NULL');
    console.log('With price_by_area:', priceByArea[0].cnt);

    console.log('\n=== Sample price_trend ===');
    const sample = await executeQuery('SELECT kapt_code, apt_name, price_trend FROM apt_sidebar_cache WHERE price_trend IS NOT NULL LIMIT 2');
    for (const row of sample) {
        console.log(`\n${row.kapt_code} - ${row.apt_name}:`);
        console.log(JSON.stringify(row.price_trend, null, 2).slice(0, 500));
    }

    console.log('\n=== Sample NULL price_trend ===');
    const nullSample = await executeQuery(`
        SELECT sc.kapt_code, sc.apt_name, ab.kaptName 
        FROM apt_sidebar_cache sc
        JOIN apt_basic_info ab ON ab.kaptCode = sc.kapt_code
        WHERE sc.price_trend IS NULL 
        LIMIT 5
    `);
    console.log('Samples with NULL price_trend:');
    for (const row of nullSample) {
        console.log(`  ${row.kapt_code}: ${row.apt_name || row.kaptName}`);
    }

    // Check if mapping exists for these
    if (nullSample.length > 0) {
        const kaptCode = nullSample[0].kapt_code;
        console.log(`\nChecking apt_name_mapping for ${kaptCode}:`);
        const mapCheck = await executeQuery('SELECT * FROM apt_name_mapping WHERE kapt_code = ?', [kaptCode]);
        console.log('Mapping found:', mapCheck.length > 0 ? mapCheck[0] : 'NONE');
    }

    await closeConnection();
}

check().catch(err => {
    console.error(err);
    closeConnection();
    process.exit(1);
});
