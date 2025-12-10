
import { executeQuery, closeConnection } from './utils/db.js';

async function fixColumns() {
    try {
        console.log('Modifying columns to utf8mb4_unicode_ci...');

        // bjdCode
        await executeQuery(`
      ALTER TABLE apt_list 
      MODIFY bjdCode VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    `);

        // as1
        await executeQuery(`
      ALTER TABLE apt_list 
      MODIFY as1 VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

        // as2
        await executeQuery(`
      ALTER TABLE apt_list 
      MODIFY as2 VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

        // as3
        await executeQuery(`
      ALTER TABLE apt_list 
      MODIFY as3 VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

        // as4
        await executeQuery(`
      ALTER TABLE apt_list 
      MODIFY as4 VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

        console.log('Done!');

    } catch (error) {
        console.error('Error fixing columns:', error);
    } finally {
        await closeConnection();
    }
}

fixColumns();
