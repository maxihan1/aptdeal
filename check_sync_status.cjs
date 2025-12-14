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

    console.log('=== 최근 거래 데이터 현황 ===\n');

    // 1. 전국 최신 거래일
    const [globalLatest] = await conn.query(`
        SELECT MAX(dealDate) as latestDate, COUNT(*) as totalCount
        FROM apt_deal_info
        WHERE dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    console.log('전국 최신 거래일:', globalLatest[0].latestDate);
    console.log('전국 30일 거래 수:', globalLatest[0].totalCount);

    // 2. 서울 최신 거래일
    const [seoulLatest] = await conn.query(`
        SELECT MAX(d.dealDate) as latestDate, COUNT(*) as count30days
        FROM apt_deal_info d
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
            FROM apt_list WHERE as1 = '서울특별시'
        ) l ON d.sggCd = l.sggCode
        WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `);
    console.log('\n서울 최신 거래일:', seoulLatest[0].latestDate);
    console.log('서울 30일 거래 수:', seoulLatest[0].count30days);

    // 3. 서울 최신날짜 거래 수 (stats API 기준)
    const seoulLatestDate = seoulLatest[0].latestDate;
    if (seoulLatestDate) {
        const dateStr = seoulLatestDate instanceof Date
            ? seoulLatestDate.toISOString().split('T')[0]
            : String(seoulLatestDate).split('T')[0];

        const [dailyCount] = await conn.query(`
            SELECT COUNT(*) as count
            FROM apt_deal_info d
            JOIN (
                SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
                FROM apt_list WHERE as1 = '서울특별시'
            ) l ON d.sggCd = l.sggCode
            WHERE d.dealDate = ?
        `, [dateStr]);
        console.log(`\n서울 ${dateStr} 일일 거래 수 (stats API 기준):`, dailyCount[0].count);

        // 4. 취소 제외 카운트
        const [dailyCountExcludeCancelled] = await conn.query(`
            SELECT COUNT(*) as count
            FROM apt_deal_info d
            JOIN (
                SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode
                FROM apt_list WHERE as1 = '서울특별시'
            ) l ON d.sggCd = l.sggCode
            WHERE d.dealDate = ?
            AND (cdealType IS NULL OR cdealType = '')
        `, [dateStr]);
        console.log(`서울 ${dateStr} 일일 거래 수 (취소 제외):`, dailyCountExcludeCancelled[0].count);
    }

    // 5. 최근 데이터 동기화 확인
    const [recentSync] = await conn.query(`
        SELECT DATE(created_at) as sync_date, COUNT(*) as count
        FROM apt_deal_info
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY sync_date DESC
    `);
    console.log('\n=== 최근 7일 데이터 동기화 현황 ===');
    console.table(recentSync);

    // 6. dealDate별 거래 수 (최근 5일)
    const [recentDeals] = await conn.query(`
        SELECT dealDate, COUNT(*) as count
        FROM apt_deal_info
        ORDER BY dealDate DESC
        LIMIT 10
    `);
    console.log('\n=== 최근 거래일별 거래 수 ===');
    console.table(recentDeals);

    await conn.end();
}

main().catch(console.error);
