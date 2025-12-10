
import { executeQuery, closeConnection } from './utils/db.js';

async function checkSpecificComplex() {
    try {
        const targetName = '테헤란로대우아이빌';
        const inputName = '테헤란로대우아이빌(891-6)';
        const region = '서울특별시 강남구 대치동';

        console.log(`Checking for input: "${inputName}" in region: "${region}"`);

        // 1. Check exact input match (simulation of current API failure)
        const exactMatch = await executeQuery(`
        SELECT kaptName, kaptCode, kaptAddr 
        FROM apt_basic_info 
        WHERE kaptName = ?
    `, [inputName]);
        console.log('1. Exact Input Match:', exactMatch);

        // 2. Check what is actually in the DB for similar names
        const likeMatch = await executeQuery(`
        SELECT kaptName, kaptCode, kaptAddr 
        FROM apt_basic_info 
        WHERE kaptName LIKE ?
    `, [`%${targetName}%`]);
        console.log('2. Similar Name Match in DB:', likeMatch);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeConnection();
    }
}

checkSpecificComplex();
