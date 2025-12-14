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

    console.log('=== 동기화 실행 이력 확인 ===\n');

    // 마지막 INSERT 시간 확인
    const [lastInsert] = await conn.query(`
        SELECT MAX(created_at) as last_insert
        FROM apt_deal_info
    `);
    console.log('마지막 데이터 삽입 시간:', lastInsert[0].last_insert);

    // 날짜별 INSERT 건수
    console.log('\n=== 날짜별 신규 삽입 건수 (created_at 기준) ===');
    const [dailyInserts] = await conn.query(`
        SELECT DATE(created_at) as insert_date, COUNT(*) as cnt
        FROM apt_deal_info
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        GROUP BY DATE(created_at)
        ORDER BY insert_date DESC
    `);
    console.table(dailyInserts);

    // 결론
    console.log('\n=== 결론 ===');
    if (dailyInserts.length > 0) {
        const lastSyncDate = dailyInserts[0].insert_date;
        console.log(`마지막 동기화 날짜: ${lastSyncDate}`);

        const today = new Date();
        const lastSync = new Date(lastSyncDate);
        const daysDiff = Math.floor((today - lastSync) / (1000 * 60 * 60 * 24));

        if (daysDiff >= 2) {
            console.log(`⚠️ 동기화가 ${daysDiff}일 전에 마지막으로 실행됨!`);
            console.log('→ 크론탭 또는 스케줄러 실행 확인 필요');
        } else {
            console.log('✅ 동기화가 최근에 실행됨');
            console.log('→ 공공데이터 API에 새 데이터가 없는 것으로 보임 (API 업데이트 지연)');
        }
    }

    await conn.end();
}

main().catch(console.error);
