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
        console.log("Identifying Safe-to-Delete records based on Average Price verification...");

        // Logic:
        // 1. Find deals < 1000 (Suspicious)
        // 2. Join with average statistics of 'Normal' deals (>= 1000) for same Apt + Area
        // 3. Flag as 'DELETE' if Price < 10% of Average

        const query = `
        SELECT 
            d.id, 
            d.sggCd,
            d.aptNm, 
            d.excluUseAr, 
            d.dealAmount as suspicious_price,
            avg_info.avg_price,
            ROUND((d.dealAmount / avg_info.avg_price) * 100, 2) as ratio
        FROM apt_deal_info d
        JOIN (
            SELECT 
                sggCd, 
                aptNm, 
                ROUND(excluUseAr) as area_round, 
                AVG(dealAmount) as avg_price,
                COUNT(*) as valid_count
            FROM apt_deal_info
            WHERE dealAmount >= 1000
            GROUP BY sggCd, aptNm, area_round
        ) avg_info ON 
            d.sggCd = avg_info.sggCd AND 
            d.aptNm = avg_info.aptNm AND 
            ROUND(d.excluUseAr) = avg_info.area_round
        WHERE 
            d.dealAmount < 1000
            AND d.dealAmount < (avg_info.avg_price * 0.1) -- Threshold: 10% of average
        LIMIT 20
    `;

        const [rows] = await pool.execute(query);

        console.log(`\nSample records that WOULD be deleted (Price < 10% of Area Average):`);
        console.table(rows);

        // Also checking ones that would be SAVED (Low price but NOT < 10% of average, if any)
        const savedQuery = `
        SELECT 
            d.id, 
            d.aptNm, 
            d.dealAmount as suspicious_price,
            avg_info.avg_price,
            ROUND((d.dealAmount / avg_info.avg_price) * 100, 2) as ratio
        FROM apt_deal_info d
        JOIN (
            SELECT 
                sggCd, 
                aptNm, 
                ROUND(excluUseAr) as area_round, 
                AVG(dealAmount) as avg_price
            FROM apt_deal_info
            WHERE dealAmount >= 1000
            GROUP BY sggCd, aptNm, area_round
        ) avg_info ON 
            d.sggCd = avg_info.sggCd AND 
            d.aptNm = avg_info.aptNm AND 
            ROUND(d.excluUseAr) = avg_info.area_round
        WHERE 
            d.dealAmount < 1000
            AND d.dealAmount >= (avg_info.avg_price * 0.1)
        LIMIT 10
    `;
        const [saved] = await pool.execute(savedQuery);
        console.log(`\nSample records that would be KEPT (Price >= 10% of Average):`);
        if (saved.length > 0) {
            console.table(saved);
        } else {
            console.log("No records found in this category (in limit range).");
        }

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
