
import { executeQuery, closeConnection } from './utils/db.js';

async function checkHighPrices() {
    try {
        const rows = await executeQuery(`
        SELECT id, aptNm, dealAmount, dealYear, dealMonth 
        FROM apt_deal_info 
        ORDER BY dealAmount DESC 
        LIMIT 10
    `);
        console.log('Top expensive deals:', rows);

        const lowRows = await executeQuery(`
        SELECT id, aptNm, dealAmount 
        FROM apt_deal_info 
        WHERE dealAmount > 100  -- Filter out potential test data < 100
        ORDER BY dealAmount ASC 
        LIMIT 5
    `);
        console.log('Lowest deals > 100:', lowRows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeConnection();
    }
}

checkHighPrices();
