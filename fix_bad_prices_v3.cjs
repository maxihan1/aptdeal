/**
 * 비정상 가격 보정 스크립트 (v3 - 2단계만 실행)
 * 1단계는 이미 처리되었으므로 바로 ×1000 보정 실행
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectionLimit: 3,
        connectTimeout: 60000
    });

    console.log(`
============================================================
  비정상 가격 보정 (v3 - 2단계만)
  동작: dealAmount × 1000
============================================================
`);

    const startTime = Date.now();
    let totalUpdated = 0;
    let batchNum = 0;

    try {
        console.log('[2단계] 레코드 ×1000 보정 중...');

        while (true) {
            batchNum++;

            const [result] = await pool.execute(`
                UPDATE apt_deal_info 
                SET dealAmount = dealAmount * 1000
                WHERE dealAmount < 1000 AND dealAmount > 0
                LIMIT 10000
            `);

            if (result.affectedRows === 0) {
                console.log('\n✅ 더 이상 보정할 레코드가 없습니다.');
                break;
            }

            totalUpdated += result.affectedRows;
            console.log(`[배치 ${batchNum}] ${result.affectedRows}건 보정 (누적: ${totalUpdated.toLocaleString()}건)`);

            if (batchNum > 500) break;
        }

        const [remaining] = await pool.execute(
            'SELECT COUNT(*) as cnt FROM apt_deal_info WHERE dealAmount < 1000'
        );

        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

        console.log(`
============================================================
  보정 완료!
  
  보정된 레코드: ${totalUpdated.toLocaleString()}건
  남은 비정상 레코드: ${remaining[0].cnt.toLocaleString()}건
  소요 시간: ${elapsedMin}분
============================================================
`);

    } catch (err) {
        console.error('오류 발생:', err.message);
    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('치명적 오류:', err);
    process.exit(1);
});
