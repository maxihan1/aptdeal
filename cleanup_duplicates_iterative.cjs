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
        connectTimeout: 60000
    });

    try {
        // 1. Get list of SGGs to process iteratively
        const [sggRows] = await pool.execute('SELECT DISTINCT LEFT(bjdCode, 5) as sggCode FROM apt_list');
        console.log(`Found ${sggRows.length} regions to process.`);

        let totalDeleted = 0;

        for (const sgg of sggRows) {
            const sggCode = sgg.sggCode;

            // Find bad deals in this SGG that have a "Normal Twin"
            // Optimizing Query: Use simple JOIN on the indexed columns if possible
            // We know we have index on sggCd.

            // Query: Find IDs of low-price (<1000) deals that have a high-price (>=1000) twin
            const [rows] = await pool.execute(`
            SELECT t1.id
            FROM apt_deal_info t1
            JOIN apt_deal_info t2 ON 
                t1.sggCd = t2.sggCd AND 
                t1.aptNm = t2.aptNm AND 
                t1.dealYear = t2.dealYear AND 
                t1.dealMonth = t2.dealMonth AND 
                t1.dealDay = t2.dealDay AND
                t1.excluUseAr = t2.excluUseAr AND
                t1.floor = t2.floor
            WHERE 
                t1.sggCd = ? AND
                t1.dealAmount < 1000 AND 
                t2.dealAmount >= 1000
        `, [sggCode]);

            if (rows.length > 0) {
                const ids = rows.map(r => r.id);
                // Delete in batches of 1000
                for (let i = 0; i < ids.length; i += 1000) {
                    const batch = ids.slice(i, i + 1000);
                    const placeholders = batch.map(() => '?').join(',');
                    await pool.execute(`DELETE FROM apt_deal_info WHERE id IN (${placeholders})`, batch);
                }
                totalDeleted += ids.length;
                console.log(`[${sggCode}] Deleted ${ids.length} duplicate bad records.`);
            } else {
                // process.stdout.write('.'); // progress dot
            }
        }

        console.log(`\nCleanup Finished. Total deleted duplicates: ${totalDeleted}`);

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
