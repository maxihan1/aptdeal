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
        // 1. Check valid deals in 1000 range?
        // Let's filter for cases that might be REAL low price deals.
        // e.g. Gangwon-do, Jeonnam, low floor, small area, but NOT duplicates
        console.log("Analyzing non-duplicate low price deals...");

        // Find low price deals that do NOT have a matching high price deal
        const [orphans] = await pool.execute(`
        SELECT t1.*, LEFT(t1.sggCd, 2) as sido
        FROM apt_deal_info t1
        LEFT JOIN apt_deal_info t2 ON 
            t1.sggCd = t2.sggCd AND 
            t1.aptNm = t2.aptNm AND 
            t1.dealYear = t2.dealYear AND 
            t1.dealMonth = t2.dealMonth AND 
            t1.dealDay = t2.dealDay AND
            t1.floor = t2.floor AND
            t1.excluUseAr = t2.excluUseAr AND
            t2.dealAmount >= 1000
        WHERE 
            t1.dealAmount < 1000 AND 
            t2.id IS NULL
        LIMIT 20
    `);

        if (orphans.length === 0) {
            console.log("All checked low price deals have a corresponding normal price deal. It's likely ALL bad data.");
        } else {
            console.log(`Found ${orphans.length} potential orphan low price deals (no high price pair found in sample):`);
            console.table(orphans.map(s => ({
                id: s.id,
                apt: s.aptNm,
                sido: s.sido,
                amt: s.dealAmount,
                date: `${s.dealYear}-${s.dealMonth}-${s.dealDay}`,
                area: s.excluUseAr
            })));
        }

        // 2. Check the very cheapest deals globally
        const [cheapest] = await pool.execute(`
        SELECT * FROM apt_deal_info WHERE dealAmount < 100 ORDER BY dealAmount ASC LIMIT 10
    `);
        console.log("\nTop 10 Cheapest Deals in DB:");
        console.table(cheapest.map(s => ({
            sgg: s.sggCd,
            apt: s.aptNm,
            amt: s.dealAmount,
            area: s.excluUseAr,
            date: `${s.dealYear}-${s.dealMonth}-${s.dealDay}`
        })));


    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
