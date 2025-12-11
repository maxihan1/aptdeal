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
        console.log("Analyzing price distribution for dealAmount < 2000 (2000만원)...");

        // Group by range
        const [ranges] = await pool.execute(`
        SELECT 
            CASE 
                WHEN dealAmount < 100 THEN '0 ~ 99 (Under 100만원)'
                WHEN dealAmount < 300 THEN '100 ~ 299'
                WHEN dealAmount < 500 THEN '300 ~ 499'
                WHEN dealAmount < 800 THEN '500 ~ 799'
                WHEN dealAmount < 1000 THEN '800 ~ 999'
                ELSE '1000+'
            END as price_range,
            COUNT(*) as count,
            MIN(dealAmount) as min,
            MAX(dealAmount) as max
        FROM apt_deal_info 
        WHERE dealAmount < 2000
        GROUP BY price_range
        ORDER BY min ASC
    `);
        console.table(ranges);

        // Let's look at some examples in the "danger zone" (e.g. 500~999) to see if they are real.
        console.log("\nSample deals between 500 and 1000 (500만원 ~ 1000만원):");
        const [midSamples] = await pool.execute(`
        SELECT * FROM apt_deal_info 
        WHERE dealAmount BETWEEN 500 AND 1000 
        LIMIT 10
    `);
        console.table(midSamples.map(s => ({
            id: s.id,
            apt: s.aptNm,
            region: s.sggCd, // Need to map this mentally or join, but raw is fine for now
            price: s.dealAmount,
            date: `${s.dealYear}-${s.dealMonth}`,
            area: s.excluUseAr
        })));

        // Let's look at samples < 100 (Under 100만원) - Likely Garbage
        console.log("\nSample deals under 100 (Under 100만원):");
        const [lowSamples] = await pool.execute(`
        SELECT * FROM apt_deal_info 
        WHERE dealAmount < 100 
        LIMIT 10
    `);
        console.table(lowSamples.map(s => ({
            id: s.id,
            apt: s.aptNm,
            price: s.dealAmount,
            date: `${s.dealYear}-${s.dealMonth}`,
            area: s.excluUseAr
        })));

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
