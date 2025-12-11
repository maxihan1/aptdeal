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
        // 1. Get stats for ONE SGG (e.g. 11620 Gwanak-gu)
        const TARGET_SGG = '11620';
        console.log(`Calculating stats for SGG ${TARGET_SGG}...`);

        const [stats] = await pool.execute(`
        SELECT 
            aptNm, 
            ROUND(excluUseAr) as area_round, 
            AVG(dealAmount) as avg_price
        FROM apt_deal_info
        WHERE sggCd = ? AND dealAmount >= 1000
        GROUP BY aptNm, area_round
    `, [TARGET_SGG]);

        // Create a Map for O(1) lookup
        // Key: aptNm + "|" + area_round
        const statMap = new Map();
        stats.forEach(s => {
            statMap.set(`${s.aptNm}|${s.area_round}`, s.avg_price);
        });
        console.log(`Loaded stats for ${statMap.size} apt/area combinations.`);

        // 2. Scan suspicious records in this SGG
        const [suspicious] = await pool.execute(`
        SELECT id, aptNm, excluUseAr, dealAmount
        FROM apt_deal_info
        WHERE sggCd = ? AND dealAmount < 1000
        LIMIT 100
    `, [TARGET_SGG]);

        const toDelete = [];
        const kept = [];

        suspicious.forEach(d => {
            const key = `${d.aptNm}|${Math.round(d.excluUseAr)}`;
            const avg = statMap.get(key);

            if (avg) {
                const ratio = d.dealAmount / avg;
                if (ratio < 0.1) { // 10% threshold
                    toDelete.push({
                        ...d,
                        avg: avg,
                        ratio: ratio.toFixed(4)
                    });
                } else {
                    kept.push({
                        ...d,
                        avg: avg,
                        ratio: ratio.toFixed(4)
                    });
                }
            } else {
                // No valid average found (maybe ALL deals for this apt are < 1000?)
                // This is a "orphan" case. We need a fallback or manual check.
                // For now, let's just log it.
                // kept.push({...d, note: "No valid average"});
            }
        });

        console.log(`\nBy comparing with local average (Threshold 10%):`);
        console.log(`Would DELETE: ${toDelete.length} records`);
        if (toDelete.length > 0) console.table(toDelete.slice(0, 10));

        console.log(`Would KEEP: ${kept.length} records`);
        if (kept.length > 0) console.table(kept.slice(0, 10));

    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

main();
