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

    console.log('=== 서울 12월 10일 데이터 확인 ===\n');

    // dealYear/Month/Day로 조회
    const [ymdResult] = await conn.query(`
        SELECT d.id, d.dealYear, d.dealMonth, d.dealDay, d.aptNm, d.dealAmount, d.cdealType
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealYear = 2025 AND d.dealMonth = 12 AND d.dealDay = 10
    `);

    console.log(`dealYear=2025, dealMonth=12, dealDay=10 으로 조회: ${ymdResult.length}건`);
    if (ymdResult.length > 0) {
        console.table(ymdResult.map(r => ({
            id: r.id,
            aptNm: r.aptNm?.substring(0, 15),
            dealAmount: r.dealAmount,
            cdealType: `"${r.cdealType}"`
        })));
    }

    // 취소 제외
    const [ymdExcludeCancelled] = await conn.query(`
        SELECT COUNT(*) as cnt
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealYear = 2025 AND d.dealMonth = 12 AND d.dealDay = 10
        AND (d.cdealType IS NULL OR d.cdealType = '')
    `);
    console.log(`취소 제외: ${ymdExcludeCancelled[0].cnt}건`);

    // deals API CASE2 시뮬레이션
    console.log('\n=== deals API CASE2 시뮬레이션 ===');
    const startDate = '2025-12-10';
    const endDate = '2025-12-10';
    const sido = '서울특별시';

    // 일일 조회 (startDate === endDate)
    const dateParts = startDate.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);

    const [dealsResult] = await conn.query(`
        SELECT id FROM apt_deal_info
        WHERE dealYear = ? AND dealMonth = ? AND dealDay = ?
        AND sggCd IN (SELECT DISTINCT LEFT(bjdCode, 5) FROM apt_list WHERE as1 = ?)
        AND (cdealType IS NULL OR cdealType = '')
        LIMIT 20
    `, [year, month, day, sido]);

    console.log(`deals API CASE2 결과: ${dealsResult.length}건`);
    if (dealsResult.length > 0) {
        console.log('IDs:', dealsResult.map(r => r.id).join(', '));
    }

    await conn.end();
}

main().catch(console.error);
