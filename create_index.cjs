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
        console.log("Creating index on dealAmount...");
        await pool.execute(`CREATE INDEX idx_deal_amount ON apt_deal_info(dealAmount)`);
        console.log("Index created successfully.");
    } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
            console.log("Index already exists.");
        } else {
            console.error("Error creating index:", err);
        }
    } finally {
        pool.end();
    }
}

main();
