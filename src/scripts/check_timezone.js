
import { executeQuery, closeConnection } from './data-loader/utils/db.js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

async function checkStatus() {
    try {
        console.log('\n=== Timezone Check ===');
        const timeInfo = await executeQuery(`
            SELECT 
                NOW() as db_now, 
                @@system_time_zone as sys_tz, 
                @@time_zone as cur_tz,
                @@global.time_zone as glob_tz
        `);
        console.log(timeInfo[0]);

        console.log('\n=== Raw DateTime String ===');
        // 가져올 때 Date 객체 변환 없이 문자열로 그대로 가져오기 확인
        const rows = await executeQuery(`
            SELECT 
                calculated_at,
                CAST(calculated_at AS CHAR) as calculated_at_str
            FROM dashboard_stats_cache 
            WHERE stat_type = 'dashboard'
            ORDER BY calculated_at DESC
            LIMIT 1
        `);
        console.log(rows[0]);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await closeConnection();
    }
}

checkStatus();
