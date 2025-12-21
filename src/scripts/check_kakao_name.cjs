const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'aptdeal',
    });

    try {
        // 1. apt_name_mapping 테이블 구조 확인
        console.log('=== apt_name_mapping 테이블 구조 ===');
        const [cols1] = await pool.query('DESCRIBE apt_name_mapping');
        cols1.forEach(c => console.log(`${c.Field}: ${c.Type}`));

        // 2. apt_search_index 테이블 구조 확인
        console.log('\n=== apt_search_index 테이블 구조 ===');
        const [cols2] = await pool.query('DESCRIBE apt_search_index');
        cols2.forEach(c => console.log(`${c.Field}: ${c.Type}`));

        // 3. 주공뜨란채 관련 데이터 확인
        console.log('\n=== 주공뜨란채 name_mapping 데이터 ===');
        const [mapping] = await pool.query("SELECT * FROM apt_name_mapping WHERE aptName = '주공뜨란채' OR kaptName LIKE '%주공뜨란채%'");
        console.log(JSON.stringify(mapping, null, 2));

        // 4. 주공뜨란채 search_index 데이터 확인
        console.log('\n=== 주공뜨란채 search_index 데이터 ===');
        const [search] = await pool.query("SELECT * FROM apt_search_index WHERE aptName = '주공뜨란채' OR displayName LIKE '%주공뜨란채%'");
        console.log(JSON.stringify(search, null, 2));

        // 5. kaptCode = A42270608 의 apt_basic_info 확인
        console.log('\n=== kaptCode=A42270608 basic_info ===');
        const [basic] = await pool.query("SELECT kaptCode, kaptName, kaptAddr, kaptTarea, kaptdaCnt FROM apt_basic_info WHERE kaptCode = 'A42270608'");
        console.log(JSON.stringify(basic, null, 2));

        // 6. kakaoName 컬럼이 있는지 확인
        console.log('\n=== kakaoName 관련 컬럼 확인 ===');
        const [hasKakao] = await pool.query(`
            SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND COLUMN_NAME LIKE '%kakao%'
        `);
        console.log(JSON.stringify(hasKakao, null, 2));

        // 7. 실거래 데이터도 확인
        console.log('\n=== 주공뜨란채 실거래 데이터 ===');
        const [deals] = await pool.query("SELECT aptNm, dong, dealAmount, dealDate FROM apt_deal_info WHERE aptNm LIKE '%주공뜨란채%' LIMIT 3");
        console.log(JSON.stringify(deals, null, 2));

    } finally {
        await pool.end();
    }
}

main().catch(console.error);
