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

        console.log("Starting cleanup of bad data (dealAmount < 1000)...");

        while (true) {
            // LIMIT을 사용하여 조금씩 삭제
            const [result] = await pool.execute(
                `DELETE FROM apt_deal_info WHERE dealAmount < 1000 LIMIT ${BATCH_SIZE}`
            );

            const deletedCount = result.affectedRows;
            totalDeleted += deletedCount;

            console.log(`Deleted ${deletedCount} rows. Total deleted: ${totalDeleted}`);

            if (deletedCount < BATCH_SIZE) {
                console.log("Cleanup finished.");
                break;
            }

            // 잠시 대기 (DB 부하 방지)
            await new Promise(resolve => setTimeout(resolve, 100));
        }

    } catch (err) {
        console.error("Error during cleanup:", err);
    } finally {
        pool.end();
    }
}

main();
