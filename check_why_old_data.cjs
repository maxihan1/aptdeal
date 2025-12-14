const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const mysql = require('mysql2/promise');
const https = require('https');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    console.log('=== 데이터 동기화 상태 점검 ===\n');
    console.log('현재 시간 (한국):', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));

    // 1. DB 최신 데이터
    console.log('\n=== 1. DB 최신 데이터 ===');
    const [latestDeals] = await conn.query(`
        SELECT dealYear, dealMonth, dealDay, COUNT(*) as count
        FROM apt_deal_info
        GROUP BY dealYear, dealMonth, dealDay
        ORDER BY dealYear DESC, dealMonth DESC, dealDay DESC
        LIMIT 10
    `);
    console.table(latestDeals.map(r => ({
        date: `${r.dealYear}-${String(r.dealMonth).padStart(2, '0')}-${String(r.dealDay).padStart(2, '0')}`,
        count: r.count
    })));

    // 2. 최근 동기화 시간
    console.log('\n=== 2. 최근 동기화 시간 (created_at 기준) ===');
    const [recentSync] = await conn.query(`
        SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as sync_time, COUNT(*) as count
        FROM apt_deal_info
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d %H:%i')
        ORDER BY sync_time DESC
        LIMIT 20
    `);
    console.table(recentSync);

    // 3. 서버에서 크론탭 실행 여부 확인
    console.log('\n=== 3. 참고 사항 ===');
    console.log('공공데이터 API는 보통 2-4일 지연되어 업데이트됩니다.');
    console.log('주말/공휴일에는 거래 자체가 없어 데이터가 없을 수 있습니다.');
    console.log('동기화 스케줄러가 크론탭에 등록되어 실행되고 있는지 확인이 필요합니다.');

    // 4. 11일, 12일, 13일 데이터 확인
    console.log('\n=== 4. 최근 며칠간 데이터 존재 여부 ===');
    for (let day = 11; day <= 14; day++) {
        const [result] = await conn.query(`
            SELECT COUNT(*) as count FROM apt_deal_info
            WHERE dealYear = 2025 AND dealMonth = 12 AND dealDay = ?
        `, [day]);
        console.log(`2025-12-${day}: ${result[0].count}건`);
    }

    await conn.end();
}

main().catch(console.error);
