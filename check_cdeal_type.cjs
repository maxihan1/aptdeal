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

    console.log('=== cdealType 값 분석 ===');
    const [cdealTypes] = await conn.query(`
        SELECT cdealType, LENGTH(cdealType) as len, COUNT(*) as count
        FROM apt_deal_info
        WHERE dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY cdealType, LENGTH(cdealType)
        ORDER BY count DESC
    `);
    console.table(cdealTypes);

    console.log('\n=== 서울 12월 9일 모든 거래 (cdealType 포함) ===');
    const [allSeoulDeals] = await conn.query(`
        SELECT d.id, d.dealDate, d.aptNm, d.dealAmount, d.cdealType, LENGTH(d.cdealType) as cdealLen
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09'
        ORDER BY d.id
    `);
    console.table(allSeoulDeals.map(s => ({
        id: s.id,
        aptNm: (s.aptNm || '').substring(0, 15),
        dealAmount: s.dealAmount,
        cdealType: `"${s.cdealType}"`,
        cdealLen: s.cdealLen
    })));

    // 필터링 테스트
    console.log('\n=== 필터링 결과 비교 ===');

    const [test1] = await conn.query(`
        SELECT COUNT(*) as count FROM apt_deal_info d
        JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode FROM apt_list WHERE as1 = '서울특별시') l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09' AND cdealType IS NULL
    `);
    console.log('cdealType IS NULL:', test1[0].count);

    const [test2] = await conn.query(`
        SELECT COUNT(*) as count FROM apt_deal_info d
        JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode FROM apt_list WHERE as1 = '서울특별시') l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09' AND cdealType = ''
    `);
    console.log('cdealType = "":', test2[0].count);

    const [test3] = await conn.query(`
        SELECT COUNT(*) as count FROM apt_deal_info d
        JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode FROM apt_list WHERE as1 = '서울특별시') l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09' AND (cdealType IS NULL OR cdealType = '')
    `);
    console.log('cdealType IS NULL OR = "":', test3[0].count);

    const [test4] = await conn.query(`
        SELECT COUNT(*) as count FROM apt_deal_info d
        JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode FROM apt_list WHERE as1 = '서울특별시') l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09' AND TRIM(cdealType) = ''
    `);
    console.log('TRIM(cdealType) = "":', test4[0].count);

    const [test5] = await conn.query(`
        SELECT COUNT(*) as count FROM apt_deal_info d
        JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode FROM apt_list WHERE as1 = '서울특별시') l ON d.sggCd = l.sggCode
        WHERE d.dealDate = '2025-12-09'
    `);
    console.log('필터 없음 (전체):', test5[0].count);

    await conn.end();
}

main().catch(console.error);
