
import { executeQuery, closeConnection } from './utils/db.js';

async function addIndex() {
    try {
        console.log('Creating index idx_rent_filter on apt_rent_info...');
        // 이미 존재하는지 확인하지 않고 그냥 생성 시도 (IF NOT EXISTS는 MariaDB 10.1.4+ / MySQL 8.0+ 지원)
        // 에러나면 무시 (Duplicate key name 등)
        await executeQuery(`
      CREATE INDEX idx_rent_filter 
      ON apt_rent_info (sggCd, dealYear, dealMonth, dealDay)
    `);
        console.log('Index created successfully!');
    } catch (error) {
        if (error.code === 'ER_DUP_KEYNAME') {
            console.log('Index already exists.');
        } else {
            console.error('Failed to create index:', error);
        }
    } finally {
        await closeConnection();
    }
}

addIndex();
