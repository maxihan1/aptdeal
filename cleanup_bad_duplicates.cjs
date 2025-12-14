/**
 * 중복 비정상 가격 정리 스크립트
 * 
 * 로직:
 * 1. 동일한 거래(sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay)에서
 * 2. 정상 가격(>=1000)과 비정상 가격(<1000)이 함께 존재하는 경우
 * 3. 비정상 가격 레코드만 삭제
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
  중복 비정상 가격 정리
  조건: 정상 가격과 비정상 가격이 함께 존재하는 중복
  동작: 비정상 가격(<1000) 레코드만 삭제
============================================================
`);

    const startTime = Date.now();
    let totalDeleted = 0;
    let batchNum = 0;

    try {
        while (true) {
            batchNum++;

            // 삭제 대상 ID 조회 (배치 단위로)
            const [rows] = await pool.execute(`
                SELECT t1.id
                FROM apt_deal_info t1
                INNER JOIN apt_deal_info t2 ON 
                    t1.sggCd = t2.sggCd AND
                    t1.aptNm = t2.aptNm AND
                    t1.excluUseAr = t2.excluUseAr AND
                    t1.floor = t2.floor AND
                    t1.dealYear = t2.dealYear AND
                    t1.dealMonth = t2.dealMonth AND
                    t1.dealDay = t2.dealDay AND
                    t1.id != t2.id
                WHERE t1.dealAmount < 1000 AND t1.dealAmount > 0
                  AND t2.dealAmount >= 1000
                LIMIT 5000
            `);

            if (rows.length === 0) {
                console.log('\n✅ 더 이상 삭제할 중복 레코드가 없습니다.');
                break;
            }

            const ids = rows.map(r => r.id);

            // 배치 삭제
            const placeholders = ids.map(() => '?').join(',');
            const [result] = await pool.execute(
                `DELETE FROM apt_deal_info WHERE id IN (${placeholders})`,
                ids
            );

            totalDeleted += result.affectedRows;

            console.log(`[배치 ${batchNum}] ${result.affectedRows}건 삭제 (누적: ${totalDeleted.toLocaleString()}건)`);

            // 안전 장치: 너무 오래 걸리면 중단
            if (batchNum > 1000) {
                console.log('⚠️ 배치 한도 도달, 중단합니다.');
                break;
            }
        }

        // 남은 비정상 데이터 확인
        const [remaining] = await pool.execute(
            'SELECT COUNT(*) as cnt FROM apt_deal_info WHERE dealAmount < 1000 AND dealAmount > 0'
        );

        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

        console.log(`
============================================================
  정리 완료!
  
  삭제된 중복 비정상 레코드: ${totalDeleted.toLocaleString()}건
  남은 비정상 레코드: ${remaining[0].cnt.toLocaleString()}건
  소요 시간: ${elapsedMin}분
  
  ※ 남은 비정상 레코드는 정상 쌍이 없는 단독 오류 데이터입니다.
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
