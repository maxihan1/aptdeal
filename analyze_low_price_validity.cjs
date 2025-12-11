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
        // 2. Sample specific low price deals (Do first as distinct count is slow)
        console.log("Sampling low price deals...");
        const [samples] = await pool.execute(`
        SELECT * FROM apt_deal_info 
        WHERE dealAmount < 1000 
        LIMIT 10
    `);
        console.table(samples.map(s => ({
            id: s.id,
            apt: s.aptNm,
            sgg: s.sggCd,
            amt: s.dealAmount,
            date: `${s.dealYear}-${s.dealMonth}-${s.dealDay}`,
            area: s.excluUseAr
        })));

        // 3. Check for "Duplicate" pattern
        if (samples.length > 0) {
            const sample = samples[0];
            console.log(`\nChecking duplicates for sample ID ${sample.id} (${sample.aptNm}, ${sample.dealAmount})...`);
            const [dups] = await pool.execute(`
            SELECT * FROM apt_deal_info
            WHERE sggCd = ? 
            AND aptNm = ? 
            AND dealYear = ? 
            AND dealMonth = ? 
            AND dealDay = ?
            AND floor = ?
            AND excluUseAr = ?
        `, [sample.sggCd, sample.aptNm, sample.dealYear, sample.dealMonth, sample.dealDay, sample.floor, sample.excluUseAr]);

            console.table(dups.map(s => ({
                id: s.id,
                apt: s.aptNm,
                amt: s.dealAmount,
                date: `${s.dealYear}-${s.dealMonth}-${s.dealDay}`,
                floor: s.floor,
                area: s.excluUseAr
            })));
        }

        /* Skipping full distribution check for now as it's too slow */
        return;
        // 1. Check for potential "Real" low price deals
        /*
        // Condition: Price < 1000 (1000만원)
        // Check distribution by Region and Year
        console.log("Checking distribution of deals < 1000...");
        const [rows] = await pool.execute(`
        SELECT 
            LEFT(sggCd, 2) as sido, 
            MIN(dealAmount) as min_price, 
            MAX(dealAmount) as max_price, 
            COUNT(*) as count,
            AVG(dealAmount) as avg_price
        FROM apt_deal_info 
        WHERE dealAmount < 1000
        GROUP BY LEFT(sggCd, 2)
    `);
        console.table(rows);
        */
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
