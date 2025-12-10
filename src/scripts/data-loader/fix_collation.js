
import { executeQuery, closeConnection } from './utils/db.js';

async function fixCollation() {
    try {
        console.log('Fixing collation for apt_list...');

        // 테이블 기본 Collation 변경
        await executeQuery(`
      ALTER TABLE apt_list CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

        console.log('Successfully changed collation for apt_list to utf8mb4_unicode_ci');

    } catch (error) {
        console.error('Error fixing collation:', error);
    } finally {
        await closeConnection();
    }
}

fixCollation();
