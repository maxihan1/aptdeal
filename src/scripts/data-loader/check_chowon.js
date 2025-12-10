
import { executeQuery, closeConnection } from './utils/db.js';

async function checkChowon() {
    try {
        const inputName = '초원마을성원상떼빌2차';
        const region = '경기도 용인기흥구 언남동'; // Note: Sigungu is concatenated "용인기흥구"

        // 1. Check exact match
        const step1 = await executeQuery(`
        SELECT kaptName, kaptAddr 
        FROM apt_basic_info 
        WHERE REPLACE(kaptName, ' ', '') = ?
    `, [inputName]);
        console.log('1. Exact Match:', step1);

        // 2. Check similar names in that dong
        const step2 = await executeQuery(`
        SELECT kaptName, kaptAddr 
        FROM apt_basic_info 
        WHERE kaptAddr LIKE '%언남동%' AND kaptName LIKE '%성원%'
    `, []);
        console.log('2. Similar in Dong:', step2);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await closeConnection();
    }
}

checkChowon();
