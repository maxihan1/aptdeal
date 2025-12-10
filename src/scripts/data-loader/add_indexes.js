
import { executeQuery, closeConnection } from './utils/db.js';

async function addIndexes() {
    try {
        console.log('Adding indexes to apt_list...');

        // as1, as2에 대한 인덱스 추가 (지역 조회 최적화)
        await executeQuery(`
      CREATE INDEX idx_apt_list_region ON apt_list (as1(10), as2(10))
    `);
        console.log('Created index: idx_apt_list_region');

        // bjdCode 인덱스 추가 (조인 최적화)
        await executeQuery(`
      CREATE INDEX idx_apt_list_bjdCode ON apt_list (bjdCode)
    `);
        console.log('Created index: idx_apt_list_bjdCode');

    } catch (error) {
        console.error('Error adding indexes:', error);
    } finally {
        await closeConnection();
    }
}

addIndexes();
