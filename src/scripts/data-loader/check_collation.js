
import { executeQuery, closeConnection } from './utils/db.js';

async function checkCollation() {
    try {
        console.log('=== apt_list Table Status ===');

        // 테이블 정보 조회
        const tableInfo = await executeQuery(`
      SELECT TABLE_COLLATION 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${process.env.MYSQL_DATABASE}' 
      AND TABLE_NAME = 'apt_list'
    `);

        if (tableInfo.length > 0) {
            console.log('Default Collation:', tableInfo[0].TABLE_COLLATION);
        } else {
            console.log('Table not found');
        }

        console.log('\n=== Column Collations ===');
        const columns = await executeQuery(`
      SHOW FULL COLUMNS FROM apt_list
    `);

        // 문제될 만한 문자열 컬럼만 출력
        columns.forEach(col => {
            if (col.Collation) {
                console.log(`${col.Field} (${col.Type}): ${col.Collation}`);
            }
        });

    } catch (error) {
        console.error(error);
    } finally {
        await closeConnection();
    }
}

checkCollation();
