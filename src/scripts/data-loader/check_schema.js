import { executeQuery, closeConnection } from './utils/db.js';

async function checkSchema() {
    try {
        const tables = ['apt_deal_info', 'apt_rent_info', 'apt_list'];

        for (const table of tables) {
            try {
                const columns = await executeQuery(`SHOW INDEX FROM ${table}`);
                console.log(`\n=== ${table} Indexes ===`);
                // Group by Key_name to show columns in index
                const indexes = {};
                columns.forEach(c => {
                    if (!indexes[c.Key_name]) indexes[c.Key_name] = [];
                    indexes[c.Key_name].push(c.Column_name);
                });
                console.log(indexes);
            } catch (err) {
                console.error(`Error describing ${table}:`, err.message);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await closeConnection();
    }
}

checkSchema();

checkSchema();
