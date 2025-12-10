
import { executeQuery, closeConnection } from './utils/db.js';

async function check() {
    try {
        console.log("Checking direct name match (aptNm = kaptName)...");
        const nameMatch = await executeQuery(`
            SELECT d.aptNm, b.kaptName
            FROM apt_deal_info d
            JOIN apt_basic_info b ON d.aptNm = b.kaptName
            LIMIT 5
        `);
        console.log("Name match result:", nameMatch);

        if (nameMatch.length === 0) {
            console.log("No exact matches found. Checking fuzzy...");
            const sample = await executeQuery('SELECT DISTINCT aptNm FROM apt_deal_info LIMIT 5');
            console.log("Sample deal aptNm:", sample.map(r => r.aptNm));
            const basicSample = await executeQuery('SELECT kaptName FROM apt_basic_info LIMIT 5');
            console.log("Sample basic kaptName:", basicSample.map(r => r.kaptName));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await closeConnection();
    }
}

check();
