/**
 * apt_search_index에 kapt_code 컬럼 추가
 * 주소 기반 매핑을 위한 스키마 변경
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

async function main() {
    console.log('=== apt_search_index 스키마 업그레이드 ===\n');

    // 1. kapt_code 컬럼 추가
    console.log('1. kapt_code 컬럼 추가 중...');
    try {
        await executeQuery(`
            ALTER TABLE apt_search_index 
            ADD COLUMN kapt_code VARCHAR(20) DEFAULT NULL
        `);
        console.log('   ✅ kapt_code 컬럼 추가 완료');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('   ⏭️ kapt_code 컬럼 이미 존재');
        } else {
            throw e;
        }
    }

    // 2. jibun 컬럼 추가
    console.log('2. jibun 컬럼 추가 중...');
    try {
        await executeQuery(`
            ALTER TABLE apt_search_index 
            ADD COLUMN jibun VARCHAR(50) DEFAULT NULL
        `);
        console.log('   ✅ jibun 컬럼 추가 완료');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('   ⏭️ jibun 컬럼 이미 존재');
        } else {
            throw e;
        }
    }

    // 3. 인덱스 추가
    console.log('3. 인덱스 추가 중...');
    try {
        await executeQuery('CREATE INDEX idx_kapt_code ON apt_search_index(kapt_code)');
        console.log('   ✅ idx_kapt_code 인덱스 추가 완료');
    } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME') {
            console.log('   ⏭️ idx_kapt_code 인덱스 이미 존재');
        } else {
            throw e;
        }
    }

    // 4. jibun 데이터 채우기 (apt_deal_info에서 가장 많이 쓰인 jibun)
    console.log('4. jibun 데이터 채우기...');
    const result = await executeQuery(`
        UPDATE apt_search_index s
        SET s.jibun = (
            SELECT d.jibun
            FROM apt_deal_info d
            WHERE d.aptNm COLLATE utf8mb4_unicode_ci = s.aptNm COLLATE utf8mb4_unicode_ci
              AND d.umdNm COLLATE utf8mb4_unicode_ci = s.umdNm COLLATE utf8mb4_unicode_ci
              AND d.jibun IS NOT NULL AND d.jibun != ''
            GROUP BY d.jibun
            ORDER BY COUNT(*) DESC
            LIMIT 1
        )
        WHERE s.jibun IS NULL
    `);
    console.log(`   ✅ ${result.affectedRows}개 행 업데이트`);

    // 5. 결과 확인
    console.log('\n5. 결과 확인:');
    const stats = await executeQuery(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN kapt_code IS NOT NULL THEN 1 ELSE 0 END) as has_kapt,
            SUM(CASE WHEN jibun IS NOT NULL THEN 1 ELSE 0 END) as has_jibun
        FROM apt_search_index
    `);
    console.log(`   총 행: ${stats[0].total.toLocaleString()}`);
    console.log(`   kapt_code 있음: ${stats[0].has_kapt.toLocaleString()}`);
    console.log(`   jibun 있음: ${stats[0].has_jibun.toLocaleString()}`);

    console.log('\n=== 스키마 업그레이드 완료 ===');
    await closeConnection();
}

main().catch(e => {
    console.error('오류:', e);
    closeConnection();
    process.exit(1);
});
