
import { executeQuery, closeConnection } from './utils/db.js';
import { getAPITotalCount, API_CONFIG } from './utils/api.js';

const SERVICE_KEY = process.env.SERVICE_KEY;

// 테스트할 샘플 (year, month, regionCode, regionName)
const samples = [
    { year: 2024, month: 1, code: '11680', name: '서울 강남구' },
    { year: 2024, month: 6, code: '11740', name: '서울 강동구' },
    { year: 2024, month: 12, code: '41135', name: '경기 수원 권선구' },
    { year: 2023, month: 3, code: '26440', name: '부산 해운대구' },
    { year: 2015, month: 1, code: '11680', name: '서울 강남구' },
];

async function verifyRecovery() {
    console.log('🔍 복구 검증 시작...\n');
    console.log('| 연도 | 월 | 지역 | API | DB | 차이 | 결과 |');
    console.log('|------|-----|------|-----|-----|------|------|');

    let allMatch = true;

    for (const sample of samples) {
        const dealYmd = `${sample.year}${String(sample.month).padStart(2, '0')}`;

        // API 건수
        const apiCount = await getAPITotalCount(API_CONFIG.DEAL_URL, sample.code, dealYmd, SERVICE_KEY);

        // DB 건수
        const [result] = await executeQuery(`
      SELECT COUNT(*) as cnt FROM apt_deal_info 
      WHERE sggCd = ? AND dealYear = ? AND dealMonth = ?
    `, [sample.code, sample.year, sample.month]);
        const dbCount = result?.cnt || 0;

        const diff = apiCount - dbCount;
        const status = diff <= 0 ? '✅' : '❌';
        if (diff > 0) allMatch = false;

        console.log(`| ${sample.year} | ${sample.month} | ${sample.name} | ${apiCount} | ${dbCount} | ${diff} | ${status} |`);
    }

    console.log('\n' + (allMatch ? '✅ 모든 샘플 검증 통과!' : '⚠️ 일부 데이터 불일치 발견'));

    // 전체 테이블 건수 확인
    const [total] = await executeQuery(`SELECT COUNT(*) as cnt FROM apt_deal_info`);
    console.log(`\n📊 apt_deal_info 전체 건수: ${total.cnt.toLocaleString()}건`);

    await closeConnection();
}

verifyRecovery().catch(console.error);
