/**
 * 비정상 가격 보정 스크립트
 * 
 * 로직:
 * 1. dealAmount < 1000 이고 dealAmount > 0 인 레코드를 찾음
 * 2. dealAmount × 1000 으로 보정
 * 3. 배치 단위로 UPDATE 실행
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
        connectionLimit: 5,
        connectTimeout: 60000
    });

    console.log(`
============================================================
  비정상 가격 보정 (×1000)
  조건: dealAmount < 1000 AND dealAmount > 0
  동작: dealAmount = dealAmount * 1000
============================================================
`);

    const startTime = Date.now();
    let totalUpdated = 0;
    let batchNum = 0;

    try {
        while (true) {
            batchNum++;

            // 배치 단위로 UPDATE (5000건씩)
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

            // 안전 장치
            if (batchNum > 500) {
                console.log('⚠️ 배치 한도 도달, 중단합니다.');
                break;
            }
        }

        // 남은 비정상 데이터 확인
        const [remaining] = await pool.execute(
            'SELECT COUNT(*) as cnt FROM apt_deal_info WHERE dealAmount < 1000'
        );

        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

        console.log(`
============================================================
  보정 완료!
  
  보정된 레코드: ${totalUpdated.toLocaleString()}건
  남은 비정상 레코드 (dealAmount < 1000): ${remaining[0].cnt.toLocaleString()}건
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
