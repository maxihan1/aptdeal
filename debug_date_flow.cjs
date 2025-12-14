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

    // stats API와 동일한 쿼리 실행
    const sido = '서울특별시';

    const regionJoin = `
      JOIN (
          SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 
          FROM apt_list
          WHERE as1 = ?
      ) l ON d.sggCd = l.sggCode
    `;

    // latestDateQuery
    const [latestDateResult] = await conn.query(`
        SELECT MAX(d.dealDate) as latestDate
        FROM apt_deal_info d
        ${regionJoin}
    `, [sido]);

    const latestDate = latestDateResult[0]?.latestDate;
    console.log('=== stats API가 반환하는 latestDate ===');
    console.log('Raw value:', latestDate);
    console.log('Type:', typeof latestDate);
    console.log('toISOString:', latestDate ? latestDate.toISOString() : null);
    console.log('split T:', latestDate ? latestDate.toISOString().split('T')[0] : null);

    // 프론트엔드 처리 시뮬레이션
    if (latestDate) {
        const dateStr = latestDate instanceof Date
            ? latestDate.toISOString().split('T')[0]
            : String(latestDate).split('T')[0];
        console.log('\n=== 프론트엔드에서 deals API 호출 시 날짜 ===');
        console.log('targetDate:', dateStr);

        // deals API CASE2 쿼리 시뮬레이션
        const [dealsResult] = await conn.query(`
            SELECT d.id, DATE(d.dealDate) as dealDate, d.aptNm
            FROM apt_deal_info d
            WHERE d.sggCd IN (SELECT DISTINCT LEFT(bjdCode, 5) FROM apt_list WHERE as1 = ?)
            AND d.dealDate >= ? AND d.dealDate <= ?
            AND (d.cdealType IS NULL OR d.cdealType = '')
            ORDER BY d.dealDate DESC
            LIMIT 20
        `, [sido, `${dateStr} 00:00:00`, `${dateStr} 23:59:59`]);

        console.log('\n=== deals API가 반환할 데이터 ===');
        console.log('Count:', dealsResult.length);
        console.table(dealsResult.map(r => ({
            id: r.id,
            dealDate: r.dealDate,
            aptNm: (r.aptNm || '').substring(0, 20)
        })));
    }

    await conn.end();
}

main().catch(console.error);
