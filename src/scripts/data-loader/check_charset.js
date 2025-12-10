
import { executeQuery, closeConnection } from './utils/db.js';

async function checkCharset() {
    try {
        console.log('=== MySQL Character Set Variables ===');
        const vars = await executeQuery(`SHOW VARIABLES LIKE '%character%'`);
        vars.forEach(v => console.log(`${v.Variable_name}: ${v.Value}`));

        console.log('\n=== MySQL Collation Variables ===');
        const collations = await executeQuery(`SHOW VARIABLES LIKE '%collation%'`);
        collations.forEach(v => console.log(`${v.Variable_name}: ${v.Value}`));

    } catch (e) {
        console.error(e);
    } finally {
        await closeConnection();
    }
}

checkCharset();
