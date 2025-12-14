const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
const mysql = require('mysql2/promise');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    console.log('=== apt_rent_info 인덱스 ===');
    const [rentIndexes] = await conn.query('SHOW INDEX FROM apt_rent_info');
    console.table(rentIndexes.map(r => ({
        Key_name: r.Key_name,
        Column_name: r.Column_name,
        Seq: r.Seq_in_index
    })));

    console.log('\n=== apt_deal_info 인덱스 ===');
    const [dealIndexes] = await conn.query('SHOW INDEX FROM apt_deal_info');
    console.table(dealIndexes.map(r => ({
        Key_name: r.Key_name,
        Column_name: r.Column_name,
        Seq: r.Seq_in_index
    })));

    console.log('\n=== apt_rent_info 컬럼 구조 ===');
    const [rentCols] = await conn.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'apt_rent_info'
        ORDER BY ORDINAL_POSITION
    `, [process.env.MYSQL_DATABASE]);
    console.table(rentCols);

    await conn.end();
}

main().catch(console.error);
