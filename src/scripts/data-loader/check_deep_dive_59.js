
import { executeQuery, closeConnection } from './utils/db.js';

async function checkDeepDive59() {
    try {
        const aptName = '테헤란로대우아이빌';

        console.log(`Checking 59sqm deals for ${aptName}...`);

        const lowPriceDeals = await executeQuery(`
        SELECT aptNm, aptDong, floor, dealAmount, jibun, dealYear, dealMonth, excluUseAr
        FROM apt_deal_info 
        WHERE (aptNm = ? OR aptNm LIKE ?)
        AND excluUseAr BETWEEN 58 AND 60
        AND dealAmount BETWEEN 40000 AND 60000
        ORDER BY dealAmount DESC
        LIMIT 5
    `, [aptName, `%${aptName}%`]);

        console.log('--- Low Price Deals (4억~6억) ---');
        console.table(lowPriceDeals);

        const highPriceDeals = await executeQuery(`
        SELECT aptNm, aptDong, floor, dealAmount, jibun, dealYear, dealMonth, excluUseAr
        FROM apt_deal_info 
        WHERE (aptNm = ? OR aptNm LIKE ?)
        AND excluUseAr BETWEEN 58 AND 60
        AND dealAmount > 80000
        ORDER BY dealAmount DESC
        LIMIT 5
    `, [aptName, `%${aptName}%`]);

        console.log('--- High Price Deals (>8억) ---');
        console.table(highPriceDeals);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeConnection();
    }
}

checkDeepDive59();
