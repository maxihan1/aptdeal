
import { createPool } from 'mysql2/promise';
import { executeQuery, closeConnection } from './utils/db.js';

async function checkDataMismatch() {
    try {
        console.log('--- Checking Top 50 Complexes with Transactions ---');

        // 1. Get top 50 complexes by transaction count in 2024
        // Using dealYear and umdNm based on observed column names in api/deals/route.ts
        const topDeals = await executeQuery(`
      SELECT aptNm, umdNm, COUNT(*) as deal_count 
      FROM apt_deal_info 
      WHERE dealYear = 2024 
      GROUP BY aptNm, umdNm 
      ORDER BY deal_count DESC 
      LIMIT 50
    `);

        let matchCount = 0;
        let mismatchCount = 0;

        console.log(`Found ${topDeals.length} complexes. Checking for matches in apt_basic_info...`);

        for (const deal of topDeals) {
            // Clean up deal.aptNm for better matching logic simulation if needed
            // But first let's try exact match like the API
            const rows = await executeQuery(`
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
                console.log(`[MISS] ${deal.aptNm} (Dong: ${deal.umdNm}) - No match in apt_basic_info`);

                // Try partial match to see if it's there under a slightly different name
                const similarRows = await executeQuery(`
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
        await closeConnection();
    }
}

checkDataMismatch();
