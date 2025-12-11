const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function main() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
    });

    try {
        // 관악구 신림동 확인
        // 1. SggCode 찾기
        const [sggRows] = await pool.execute(
            `SELECT DISTINCT LEFT(bjdCode, 5) as sggCode FROM apt_list WHERE as1='서울특별시' AND as2='관악구'`
        );
        if (sggRows.length === 0) { console.log('Region not found'); return; }
        const sggCode = sggRows[0].sggCode;

        // 2. 오류 데이터 조회
        const [rows] = await pool.execute(
            `SELECT * FROM apt_deal_info 
         WHERE sggCd = ? AND umdNm = '신림동' AND dealAmount < 2000
         ORDER BY dealAmount ASC LIMIT 20`,
            [sggCode]
        );

        console.log("Low price deals in Gwanak-gu Sillim-dong:");
        console.table(rows.map(r => ({
            id: r.id,
            apt: r.aptNm,
            price: r.dealAmount, // 만원 단위
            date: `${r.dealYear}-${r.dealMonth}-${r.dealDay}`,
            area: r.excluUseAr
        })));

        // 3. 전체 데이터 통계
        const [countAll] = await pool.execute(
            `SELECT COUNT(*) as cnt FROM apt_deal_info WHERE dealAmount < 1000`
        );
        console.log(`\nTotal records in DB with dealAmount < 1000 (1000만원): ${countAll[0].cnt}`);

        // 시도별 분포 확인 (sggCd 앞 2자리)
        const [dist] = await pool.execute(
            `SELECT LEFT(sggCd, 2) as sidoCode, COUNT(*) as cnt 
         FROM apt_deal_info 
         WHERE dealAmount < 1000 
         GROUP BY LEFT(sggCd, 2) 
         ORDER BY cnt DESC`
        );

        // Sido 코드 매핑 가져오기
        const [sidoRows] = await pool.execute('SELECT DISTINCT LEFT(bjdCode, 2) as code, as1 as name FROM apt_list');
        const sidoMap = {};
        sidoRows.forEach(r => sidoMap[r.code] = r.name);

        console.log("\nDistribution by Sido:");
        console.table(dist.map(d => ({
            sido: sidoMap[d.sidoCode] || d.sidoCode,
            count: d.cnt
        })));

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
