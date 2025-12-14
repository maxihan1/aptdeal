const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const mysql = require('mysql2/promise');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    console.log('=== deals API CASE2 시뮬레이션 (정확한 쿼리) ===\n');

    const startDate = '2025-12-10';
    const endDate = '2025-12-10';
    const sido = '서울특별시';

    // 일일 조회
    const dateParts = startDate.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);

    let subQueryWhere = '1=1';
    const subQueryParams = [];

    // 날짜 필터
    subQueryWhere += ` AND dealYear = ? AND dealMonth = ? AND dealDay = ? `;
    subQueryParams.push(year, month, day);

    // sido 필터 (이름인 경우)
    subQueryWhere += ` AND sggCd IN (SELECT DISTINCT LEFT(bjdCode, 5) FROM apt_list WHERE as1 = ?) `;
    subQueryParams.push(sido);

    // 취소 제외 (TRIM 적용 후)
    subQueryWhere += ` AND (cdealType IS NULL OR TRIM(cdealType) = '') `;

    console.log('subQueryWhere:', subQueryWhere);
    console.log('subQueryParams:', subQueryParams);

    const subQuery = `
        SELECT id 
        FROM apt_deal_info 
        WHERE ${subQueryWhere}
        ORDER BY dealDate DESC
        LIMIT 20 OFFSET 0
    `;

    console.log('\n실행할 서브쿼리:');
    console.log(subQuery);

    const [subResult] = await conn.query(subQuery, subQueryParams);
    console.log('\n서브쿼리 결과:', subResult.length, '건');

    if (subResult.length > 0) {
        console.log('IDs:', subResult.map(r => r.id).join(', '));

        // 메인 쿼리
        const ids = subResult.map(r => r.id);
        const [fullResult] = await conn.query(`
            SELECT d.id, d.aptNm, d.dealAmount, d.dealYear, d.dealMonth, d.dealDay
            FROM apt_deal_info d
            WHERE d.id IN (?)
        `, [ids]);

        console.log('\n메인 쿼리 결과:');
        console.table(fullResult);
    }

    await conn.end();
}

main().catch(console.error);
