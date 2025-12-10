
import { executeQuery, closeConnection } from './utils/db.js';

async function explain() {
    const query = `
    EXPLAIN SELECT DISTINCT
      d.id, d.aptNm, d.sggCd, d.dealAmount
    FROM apt_deal_info d
    INNER JOIN apt_list a ON d.sggCd = LEFT(a.bjdCode, 5)
    WHERE a.as1 = '경기도' 
      AND a.as2 = '성남시 분당구'
      AND d.dealYear = 2024 AND d.dealMonth = 12
  `;

    try {
        const rows = await executeQuery(query);
        console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await closeConnection();
    }
}

explain();
