
import { executeQuery, closeConnection } from './utils/db.js';

async function describeTable() {
    try {
        const columns = await executeQuery("DESCRIBE apt_basic_info");
        console.log(columns.map(c => `${c.Field} (${c.Type})`));

        // Also check one row to see what the address looks like
        const rows = await executeQuery("SELECT * FROM apt_basic_info LIMIT 1");
        console.log("Sample Data:", rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await closeConnection();
    }
}

describeTable();
