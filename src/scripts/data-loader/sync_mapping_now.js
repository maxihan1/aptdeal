/**
 * apt_search_index → apt_name_mapping 즉시 동기화 스크립트
 * 실행: node src/scripts/data-loader/sync_mapping_now.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== apt_name_mapping 동기화 시작 ===\n');

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 1. apt_search_index → apt_name_mapping 동기화
        console.log('1. apt_search_index에서 apt_name_mapping으로 동기화 중...');
        const syncResult = await executeQuery(`
            INSERT IGNORE INTO apt_name_mapping (deal_apt_name, kapt_code)
            SELECT aptNm, kapt_code
            FROM apt_search_index
            WHERE kapt_code IS NOT NULL 
              AND kapt_code != 'UNMAPPED'
              AND kapt_code != ''
        `);
        console.log(`   ✅ ${syncResult.affectedRows}개 매핑 추가`);

        // 2. 동기화 현황 확인
        console.log('\n2. 현재 매핑 현황:');
        const stats = await executeQuery(`
            SELECT 
                (SELECT COUNT(*) FROM apt_search_index WHERE kapt_code IS NOT NULL AND kapt_code != 'UNMAPPED' AND kapt_code != '') as search_with_kapt,
                (SELECT COUNT(DISTINCT deal_apt_name) FROM apt_name_mapping) as mapping_count
        `);
        console.log(`   apt_search_index (kapt_code 있음): ${stats[0].search_with_kapt}`);
        console.log(`   apt_name_mapping 총 매핑: ${stats[0].mapping_count}`);

        // 3. 종암SK 확인
        console.log('\n3. 종암SK 매핑 확인:');
        const check = await executeQuery(`
            SELECT deal_apt_name, kapt_code, umdNm, sggCd 
            FROM apt_name_mapping 
            WHERE deal_apt_name LIKE '%종암%'
            LIMIT 10
        `);
        console.log(JSON.stringify(check, null, 2));

        console.log('\n=== 동기화 완료 ===');
        console.log('캐시를 재생성하려면: node src/scripts/data-loader/create_sidebar_cache.js');

    } catch (error) {
        console.error('오류:', error.message);
    } finally {
        await closeConnection();
    }
}

main().catch(console.error);
