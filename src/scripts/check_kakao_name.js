/**
 * 카카오 이름 매핑 현황 확인 스크립트
 */
import { executeQuery, testConnection, closeConnection } from './data-loader/utils/db.js';

async function main() {
    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 1. apt_name_mapping 테이블 구조 확인
        console.log('\n=== apt_name_mapping 테이블 구조 ===');
        const cols1 = await executeQuery('DESCRIBE apt_name_mapping');
        cols1.forEach(c => console.log(`${c.Field}: ${c.Type}`));

        // 2. apt_search_index 테이블 구조 확인
        console.log('\n=== apt_search_index 테이블 구조 ===');
        const cols2 = await executeQuery('DESCRIBE apt_search_index');
        cols2.forEach(c => console.log(`${c.Field}: ${c.Type}`));

        // 3. 주공뜨란채 관련 데이터 확인 (deal_apt_name or basis_apt_name)
        console.log('\n=== 주공뜨란채 name_mapping 데이터 ===');
        const mapping = await executeQuery("SELECT * FROM apt_name_mapping WHERE deal_apt_name = '주공뜨란채' OR basis_apt_name LIKE '%주공뜨란채%'");
        console.log(JSON.stringify(mapping, null, 2));

        // 4. 주공뜨란채 search_index 데이터 확인 (aptNm)
        console.log('\n=== 주공뜨란채 search_index 데이터 ===');
        const search = await executeQuery("SELECT * FROM apt_search_index WHERE aptNm = '주공뜨란채' OR aptNm LIKE '%주공뜨란채%'");
        console.log(JSON.stringify(search, null, 2));

        // 5. kaptCode = A42270608 의 apt_basic_info 확인
        console.log('\n=== kaptCode=A42270608 basic_info ===');
        const basic = await executeQuery("SELECT kaptCode, kaptName, kaptAddr, kaptTarea, kaptdaCnt FROM apt_basic_info WHERE kaptCode = 'A42270608'");
        console.log(JSON.stringify(basic, null, 2));

        // 6. kakaoName 또는 display 관련 컬럼 확인
        console.log('\n=== kakao/display 관련 컬럼 확인 ===');
        const hasKakao = await executeQuery(`
            SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND (COLUMN_NAME LIKE '%kakao%' OR COLUMN_NAME LIKE '%display%')
        `);
        console.log(JSON.stringify(hasKakao, null, 2));

        // 7. 실거래 데이터도 확인
        console.log('\n=== 주공뜨란채 실거래 데이터 ===');
        const deals = await executeQuery("SELECT aptNm, dong, dealAmount, dealDate FROM apt_deal_info WHERE aptNm LIKE '%주공뜨란채%' LIMIT 3");
        console.log(JSON.stringify(deals, null, 2));

        // 8. search_index 전체 현황
        console.log('\n=== search_index 전체 현황 ===');
        const searchStats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN kapt_code IS NOT NULL AND kapt_code != '' THEN 1 ELSE 0 END) as has_kapt_code
            FROM apt_search_index
        `);
        console.log(JSON.stringify(searchStats, null, 2));

    } finally {
        await closeConnection();
    }
}

main().catch(console.error);
