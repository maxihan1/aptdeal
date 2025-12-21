/**
 * 특정 아파트의 displayName을 카카오 API로 업데이트
 * 또는 K-apt 데이터베이스의 kaptName으로 설정
 */
import { executeQuery, testConnection, closeConnection } from './data-loader/utils/db.js';

async function main() {
    console.log('=== displayName 수동 업데이트 ===\n');

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 1. kapt_code가 있는 모든 아파트에 대해 kaptName으로 displayName 설정
        console.log('1. kapt_code -> kaptName 매핑으로 displayName 업데이트...');

        const updateResult = await executeQuery(`
            UPDATE apt_search_index si
            JOIN apt_basic_info b ON si.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            SET si.displayName = b.kaptName
            WHERE si.displayName IS NULL
              AND si.kapt_code IS NOT NULL
              AND si.kapt_code != 'UNMAPPED'
        `);

        console.log('   업데이트된 행:', updateResult.affectedRows);

        // 2. 주공뜨란채 (소사본동) 확인
        console.log('\n2. 주공뜨란채 (소사본동) 확인...');
        const check = await executeQuery(`
            SELECT si.aptNm, si.displayName, si.umdNm, si.kapt_code, b.kaptName
            FROM apt_search_index si
            LEFT JOIN apt_basic_info b ON si.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.aptNm = '주공뜨란채' AND si.umdNm = '소사본동'
        `);
        console.log(JSON.stringify(check, null, 2));

        // 3. 전체 displayName 현황
        console.log('\n3. displayName 현황...');
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN displayName IS NOT NULL THEN 1 ELSE 0 END) as has_display_name,
                SUM(CASE WHEN kapt_code IS NOT NULL AND kapt_code != 'UNMAPPED' THEN 1 ELSE 0 END) as has_kapt_code
            FROM apt_search_index
        `);
        console.log(JSON.stringify(stats, null, 2));

    } finally {
        await closeConnection();
    }
}

main().catch(console.error);
