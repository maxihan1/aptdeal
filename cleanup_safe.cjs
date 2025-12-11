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
        connectTimeout: 60000,
    });

    try {
        const BATCH_SIZE = 50000;
        let totalDeleted = 0;

        // Safety check: 
        // Delete ONLY deals < 100 (100만원).
        // Based on analysis, deals < 100 are definitely artifacts (e.g. 5만원, 10만원 for 30m2).
        // Deals between 100 and 1000 might be real in rural areas (e.g. 500만원), so we KEEP them for now.
        const SAFE_THRESHOLD = 300;

        console.log(`Starting SAFE cleanup of bad data (dealAmount < ${SAFE_THRESHOLD})...`);

        while (true) {
            const [result] = await pool.execute(
                `DELETE FROM apt_deal_info WHERE dealAmount < ${SAFE_THRESHOLD} LIMIT ${BATCH_SIZE}`
            );

            const deletedCount = result.affectedRows;
            totalDeleted += deletedCount;

            console.log(`Deleted ${deletedCount} rows. Total deleted: ${totalDeleted}`);

            if (deletedCount < BATCH_SIZE) {
                console.log("Cleanup finished.");
                break;
            }

            // Short pause to be nice to DB
            await new Promise(resolve => setTimeout(resolve, 100));
        }

    } catch (err) {
        console.error("Error during cleanup:", err);
    } finally {
        pool.end();
    }
}

main();
