
import { executeQuery, closeConnection } from './utils/db.js';

async function addDealIndexes() {
    try {
        console.log('Adding indexes to apt_deal_info and apt_rent_info...');

        // apt_deal_info 복합 인덱스
        await executeQuery(`
      CREATE INDEX idx_deal_sgg_date ON apt_deal_info (sggCd(10), dealYear, dealMonth)
    `);
        console.log('Created index: idx_deal_sgg_date');

        // apt_rent_info 복합 인덱스
        await executeQuery(`
      CREATE INDEX idx_rent_sgg_date ON apt_rent_info (sggCd(10), dealYear, dealMonth)
    `);
        console.log('Created index: idx_rent_sgg_date');

    } catch (error) {
        console.error('Error adding indexes:', error);
    } finally {
        await closeConnection();
    }
}

addDealIndexes();
