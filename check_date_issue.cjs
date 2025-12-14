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

    console.log('=== dealDate 컬럼 타입 확인 ===');
    const [cols] = await conn.query(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'apt_deal_info' AND COLUMN_NAME = 'dealDate'
    `, [process.env.MYSQL_DATABASE]);
    console.table(cols);

    console.log('\n=== 12월 9일 서울 거래 확인 ===');

    // 1. DATE 비교 (stats API 방식)
    const [dateCompare] = await conn.query(`
        SELECT COUNT(*) as count
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09'
        AND (cdealType IS NULL OR cdealType = '')
    `);
    console.log('DATE = "2025-12-09" 방식 (취소제외):', dateCompare[0].count, '건');

    // 2. DATETIME 범위 비교 (deals API 방식)
    const [datetimeCompare] = await conn.query(`
        SELECT COUNT(*) as count
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate >= '2025-12-09 00:00:00' AND d.dealDate <= '2025-12-09 23:59:59'
        AND (cdealType IS NULL OR cdealType = '')
    `);
    console.log('DATETIME >= "2025-12-09 00:00:00" AND <= "2025-12-09 23:59:59" 방식 (취소제외):', datetimeCompare[0].count, '건');

    // 3. 서브쿼리 방식 (deals API CASE2)
    const [subqueryCompare] = await conn.query(`
        SELECT COUNT(*) as count
        FROM (
            SELECT id FROM apt_deal_info
            WHERE dealDate >= '2025-12-09 00:00:00' AND dealDate <= '2025-12-09 23:59:59'
            AND sggCd IN (SELECT DISTINCT LEFT(bjdCode, 5) FROM apt_list WHERE as1 = '서울특별시')
            AND (cdealType IS NULL OR cdealType = '')
            LIMIT 20
        ) sub
    `);
    console.log('deals API CASE2 방식 (LIMIT 20, 취소제외):', subqueryCompare[0].count, '건');

    // 4. 실제 dealDate 값 확인
    console.log('\n=== 서울 12월 최근 거래 실제 데이터 ===');
    const [samples] = await conn.query(`
        SELECT d.dealDate, d.aptNm, d.dealAmount, d.cdealType
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate >= '2025-12-09'
        ORDER BY d.dealDate DESC
        LIMIT 20
    `);
    console.table(samples.map(s => ({
        dealDate: s.dealDate,
        aptNm: (s.aptNm || '').substring(0, 15),
        dealAmount: s.dealAmount,
        cdealType: s.cdealType || '-'
    })));

    await conn.end();
}

main().catch(console.error);
