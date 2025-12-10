
import { executeQuery, closeConnection } from './utils/db.js';

async function checkDuplicates() {
    console.log('🔍 중복 데이터 확인 중...\n');

    // 강남구 2024-01 중복 체크
    const duplicates = await executeQuery(`
    SELECT sggCd, dealYear, dealMonth, dealDay, aptNm, floor, excluUseAr, dealAmount, COUNT(*) as cnt
    FROM apt_deal_info
    WHERE sggCd = '11680' AND dealYear = 2024 AND dealMonth = 1
    GROUP BY sggCd, dealYear, dealMonth, dealDay, aptNm, floor, excluUseAr, dealAmount
    HAVING cnt > 1
    LIMIT 5
  `);

    console.log('서울 강남구 2024-01 중복 샘플:');
    if (duplicates.length > 0) {
        console.log(duplicates);
        console.log(`\n⚠️ 중복 데이터 발견! (${duplicates.length}건 이상)`);
    } else {
        console.log('✅ 중복 없음');
    }

    // 전체 테이블 UNIQUE 제약조건 확인
    console.log('\n--- 테이블 인덱스 확인 ---');
    const indexes = await executeQuery(`SHOW INDEX FROM apt_deal_info`);
    const uniqueIndexes = indexes.filter(i => i.Non_unique === 0);
    console.log('UNIQUE 인덱스:', uniqueIndexes.map(i => i.Key_name));

    await closeConnection();
}

checkDuplicates().catch(console.error);
