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
        // Try to find a case where we have BOTH low price AND normal price for same apt/date/floor/area
        console.log("Searching for duplicate pairs (normal vs low price)...");

        // Self join query to find potential bad-data pairs
        // Note: This might be slow without specific indexes, but let's try with a LIMIT
        const [dups] = await pool.execute(`
        SELECT 
            t1.id as bad_id, t1.dealAmount as bad_price,
            t2.id as good_id, t2.dealAmount as good_price,
            t1.aptNm, t1.sggCd, t1.dealYear, t1.dealMonth, t1.dealDay
        FROM apt_deal_info t1
        JOIN apt_deal_info t2 ON 
            t1.sggCd = t2.sggCd AND 
            t1.aptNm = t2.aptNm AND 
            t1.dealYear = t2.dealYear AND 
            t1.dealMonth = t2.dealMonth AND 
            t1.dealDay = t2.dealDay AND
            t1.floor = t2.floor AND
            t1.excluUseAr = t2.excluUseAr
        WHERE 
            t1.dealAmount < 1000 AND 
            t2.dealAmount >= 1000
        LIMIT 20
    `);

        if (dups.length > 0) {
            console.log("Found duplicate pairs:");
            console.table(dups);
        } else {
            console.log("No direct duplicate pairs found in the first 20 matches.");

            // If no duplicates found, check if the low price ones are just standalone errors
            // or actually extremely cheap deals (e.g. 500만원 apartment?)
            console.log("Checking details of standalone low price deals...");
        }

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
