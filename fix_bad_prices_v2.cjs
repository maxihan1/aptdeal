/**
 * 비정상 가격 보정 스크립트 (v2)
 * 
 * 로직:
 * 1. dealAmount < 1000 인 레코드 중
 * 2. ×1000 했을 때 중복이 되는 경우 → 삭제 (이미 정상 데이터 존재)
 * 3. ×1000 했을 때 중복이 안 되는 경우 → 보정
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
  비정상 가격 보정 (v2)
  1단계: 중복될 레코드 삭제
  2단계: 나머지 레코드 ×1000 보정
============================================================
`);

    const startTime = Date.now();
    let totalDeleted = 0;
    let totalUpdated = 0;

    try {
        // 1단계: 보정 시 중복될 레코드 삭제
        console.log('\\n[1단계] 보정 시 중복될 레코드 삭제 중...');

        let batchNum = 0;
        while (true) {
            batchNum++;

            // 보정했을 때 중복이 될 레코드의 ID 조회
            const [rows] = await pool.execute(`
                SELECT t1.id
                FROM apt_deal_info t1
                WHERE t1.dealAmount < 1000 AND t1.dealAmount > 0
                AND EXISTS (
                    SELECT 1 FROM apt_deal_info t2
                    WHERE t1.sggCd = t2.sggCd
                    AND t1.aptNm = t2.aptNm
                    AND t1.excluUseAr = t2.excluUseAr
                    AND t1.floor = t2.floor
                    AND t1.dealYear = t2.dealYear
                    AND t1.dealMonth = t2.dealMonth
                    AND t1.dealDay = t2.dealDay
                    AND t2.dealAmount = t1.dealAmount * 1000
                )
                LIMIT 5000
            `);

            if (rows.length === 0) break;

            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            const [result] = await pool.execute(
                `DELETE FROM apt_deal_info WHERE id IN (${placeholders})`,
                ids
            );

            totalDeleted += result.affectedRows;
            console.log(`  [배치 ${batchNum}] ${result.affectedRows}건 삭제 (누적: ${totalDeleted.toLocaleString()}건)`);

            if (batchNum > 200) break;
        }

        console.log(`\\n✅ 1단계 완료: ${totalDeleted.toLocaleString()}건 삭제`);

        // 2단계: 나머지 레코드 보정
        console.log('\\n[2단계] 나머지 레코드 ×1000 보정 중...');

        batchNum = 0;
        while (true) {
            batchNum++;

            const [result] = await pool.execute(`
                UPDATE apt_deal_info 
                SET dealAmount = dealAmount * 1000
                WHERE dealAmount < 1000 AND dealAmount > 0
                LIMIT 10000
            `);

            if (result.affectedRows === 0) break;

            totalUpdated += result.affectedRows;
            console.log(`  [배치 ${batchNum}] ${result.affectedRows}건 보정 (누적: ${totalUpdated.toLocaleString()}건)`);

            if (batchNum > 500) break;
        }

        console.log(`\\n✅ 2단계 완료: ${totalUpdated.toLocaleString()}건 보정`);

        // 최종 확인
        const [remaining] = await pool.execute(
            'SELECT COUNT(*) as cnt FROM apt_deal_info WHERE dealAmount < 1000'
        );

        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

        console.log(`
============================================================
  처리 완료!
  
  삭제된 레코드: ${totalDeleted.toLocaleString()}건
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
