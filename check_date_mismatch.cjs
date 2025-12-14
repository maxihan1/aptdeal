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

    console.log('=== 서울 최근 거래 실제 데이터 (dealYear/Month/Day vs dealDate) ===');
    const [samples] = await conn.query(`
        SELECT d.id, d.dealDate, d.dealYear, d.dealMonth, d.dealDay, d.aptNm
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate >= '2025-12-07'
        ORDER BY d.dealDate DESC
        LIMIT 20
    `);

    console.table(samples.map(s => ({
        id: s.id,
        dealDate_UTC: s.dealDate,
        dealYear: s.dealYear,
        dealMonth: s.dealMonth,
        dealDay: s.dealDay,
        computedDate: `${s.dealYear}-${String(s.dealMonth).padStart(2, '0')}-${String(s.dealDay).padStart(2, '0')}`,
        aptNm: (s.aptNm || '').substring(0, 15)
    })));

    // MAX(dealDate) vs MAX(dealYear, dealMonth, dealDay)
    console.log('\n=== 서울 최신 날짜 비교 ===');
    const [maxDealDate] = await conn.query(`
        SELECT MAX(d.dealDate) as maxDealDate
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
    `);
    console.log('MAX(dealDate) (UTC):', maxDealDate[0].maxDealDate);

    const [maxYMD] = await conn.query(`
        SELECT d.dealYear, d.dealMonth, d.dealDay
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        ORDER BY d.dealYear DESC, d.dealMonth DESC, d.dealDay DESC
        LIMIT 1
    `);
    console.log('실제 최신 거래 (dealYear-Month-Day):',
        maxYMD[0] ? `${maxYMD[0].dealYear}-${maxYMD[0].dealMonth}-${maxYMD[0].dealDay}` : null);

    await conn.end();
}

main().catch(console.error);
