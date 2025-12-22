import 'dotenv/config';
import mysql from 'mysql2/promise';

async function checkMissingCoords() {
    const pool = await mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectTimeout: 30000,
    });

    try {
        // 좌표 없는 아파트 수
        const [countRows] = await pool.query(`
            SELECT COUNT(*) as cnt FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL AND kaptAddr != ''
        `);
        console.log(`\n📊 좌표 없는 아파트: ${countRows[0].cnt}개\n`);

        // 좌표 없는 아파트 목록 (상위 50개)
        const [rows] = await pool.query(`
            SELECT b.kaptCode, b.kaptName, b.kaptAddr, 
                   COALESCE(sc.dealCount30d, 0) as recentDeals
            FROM apt_basic_info b
            LEFT JOIN apt_sidebar_cache sc ON b.kaptCode = sc.kaptCode
            WHERE (b.latitude IS NULL OR b.longitude IS NULL)
            AND b.kaptAddr IS NOT NULL AND b.kaptAddr != ''
            ORDER BY COALESCE(sc.dealCount30d, 0) DESC
            LIMIT 50
        `);

        console.log('📍 좌표 없는 아파트 목록 (최근 거래 많은 순):\n');
        console.log('kaptCode\t\t최근30일거래\t단지명\t\t\t\t주소');
        console.log('─'.repeat(100));

        for (const row of rows) {
            const name = row.kaptName.padEnd(20, ' ').substring(0, 20);
            console.log(`${row.kaptCode}\t${row.recentDeals}\t\t${name}\t${row.kaptAddr.substring(0, 40)}`);
        }

    } finally {
        await pool.end();
    }
}

checkMissingCoords().catch(console.error);
