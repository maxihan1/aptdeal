/**
 * jibun 필드 null 비율 및 Option A 안전성 검증
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== jibun 필드 현황 체크 ===\n');

    // 1. apt_deal_info의 jibun null 비율
    const dealStats = await executeQuery(`
        SELECT 
            COUNT(*) as total_deals,
            SUM(CASE WHEN jibun IS NULL OR jibun = '' THEN 1 ELSE 0 END) as null_jibun,
            ROUND(SUM(CASE WHEN jibun IS NULL OR jibun = '' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as null_percent
        FROM apt_deal_info
    `);
    console.log('📊 apt_deal_info jibun 현황:');
    console.log(`   총 거래: ${dealStats[0].total_deals.toLocaleString()}건`);
    console.log(`   jibun 없음: ${dealStats[0].null_jibun.toLocaleString()}건 (${dealStats[0].null_percent}%)\n`);

    // 2. apt_search_index 현재 구조
    console.log('📋 apt_search_index 현재 컬럼:');
    const columns = await executeQuery('SHOW COLUMNS FROM apt_search_index');
    columns.forEach(col => console.log(`   - ${col.Field} (${col.Type})`));

    // 3. kapt_code 컬럼 존재 여부
    const hasKaptCode = columns.some(c => c.Field === 'kapt_code');
    console.log(`\n   kapt_code 컬럼: ${hasKaptCode ? '✅ 이미 존재' : '❌ 없음 (추가 필요)'}`);

    // 4. apt_name_mapping과의 매칭률 샘플
    console.log('\n📊 apt_name_mapping 커버리지:');
    const mappingCoverage = await executeQuery(`
        SELECT 
            (SELECT COUNT(*) FROM apt_search_index) as total_search,
            (SELECT COUNT(*) FROM apt_name_mapping) as total_mapping,
            (SELECT COUNT(DISTINCT CONCAT(deal_apt_name, '|', umd_nm)) FROM apt_name_mapping) as unique_mapping
    `);
    console.log(`   검색 인덱스: ${mappingCoverage[0].total_search.toLocaleString()}건`);
    console.log(`   매핑 테이블: ${mappingCoverage[0].total_mapping.toLocaleString()}건`);

    // 5. 주소 기반 매핑 가능성 (jibun 있는 거래의 K-apt 매칭 가능률)
    console.log('\n📊 주소 기반 매핑 가능성 (샘플 1000개):');
    const sampleMatches = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN b.kaptCode IS NOT NULL THEN 1 ELSE 0 END) as matched
        FROM (
            SELECT DISTINCT jibun, umdNm
            FROM apt_deal_info
            WHERE jibun IS NOT NULL AND jibun != ''
            LIMIT 1000
        ) d
        LEFT JOIN apt_basic_info b ON 
            b.kaptAddr LIKE CONCAT('%', d.umdNm, '%')
            AND b.kaptAddr LIKE CONCAT('%', d.jibun, '%')
    `);
    const matchRate = (sampleMatches[0].matched * 100. / sampleMatches[0].total).toFixed(1);
    console.log(`   샘플 중 K-apt 매칭: ${sampleMatches[0].matched}/${sampleMatches[0].total} (${matchRate}%)`);

    console.log('\n=== 검증 완료 ===');
    await closeConnection();
}

main().catch(e => {
    console.error(e);
    closeConnection();
});
