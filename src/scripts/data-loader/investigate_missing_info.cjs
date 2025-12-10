
const { createPool } = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'password',
    database: 'apt_price_db',
};

async function checkDataMismatch() {
    const pool = createPool(dbConfig);

    try {
        console.log('--- Checking Top 50 Complexes with Transactions ---');

        // 1. Get top 50 complexes by transaction count in 2024
        const [topDeals] = await pool.query(`
      SELECT aptNm, region, COUNT(*) as deal_count 
      FROM apt_deal_info 
      WHERE year = 2024 
      GROUP BY aptNm, region 
      ORDER BY deal_count DESC 
      LIMIT 50
    `);

        let matchCount = 0;
        let mismatchCount = 0;

        console.log(`Found ${topDeals.length} complexes. Checking for matches in apt_basic_info...`);

        for (const deal of topDeals) {
            // Clean up deal.aptNm for better matching logic simulation if needed
            // But first let's try exact match like the API
            const [rows] = await pool.query(`
         SELECT kaptName, kaptCode 
         FROM apt_basic_info 
         WHERE kaptName = ? COLLATE utf8mb4_unicode_ci 
         LIMIT 1
       `, [deal.aptNm]);

            if (rows.length > 0) {
                matchCount++;
                // console.log(`[MATCH] ${deal.aptNm} -> ${rows[0].kaptName} (${rows[0].kaptCode})`);
            } else {
                mismatchCount++;
                console.log(`[MISS] ${deal.aptNm} (${deal.region}) - No match in apt_basic_info`);

                // Try partial match to see if it's there under a slightly different name
                const [similarRows] = await pool.query(`
           SELECT kaptName 
           FROM apt_basic_info 
           WHERE kaptName LIKE ? 
           LIMIT 3
         `, [`%${deal.aptNm}%`]);

                if (similarRows.length > 0) {
                    console.log(`    -> Possible matches: ${similarRows.map(r => r.kaptName).join(', ')}`);
                }
            }
        }

        console.log('------------------------------------------------');
        console.log(`Total Checked: ${topDeals.length}`);
        console.log(`Matched: ${matchCount}`);
        console.log(`Missed: ${mismatchCount}`);
        console.log(`Match Rate: ${((matchCount / topDeals.length) * 100).toFixed(1)}%`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkDataMismatch();
