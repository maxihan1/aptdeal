import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

console.log('=== 기타 패턴 세부 분석 ===\n');

const noPriceApts = await executeQuery(`
  SELECT pc.kapt_code, pc.kapt_name, b.kaptAddr
  FROM apt_price_cache pc
  JOIN apt_basic_info b ON pc.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
  WHERE (pc.avg_price_365d = 0 OR pc.avg_price_365d IS NULL) 
    AND (pc.last_deal_price = 0 OR pc.last_deal_price IS NULL)
    AND (b.kaptUsedate < '20240101' OR b.kaptUsedate IS NULL)
    AND NOT (kapt_name LIKE '%주공%' OR kapt_name LIKE '%LH%' OR kapt_name LIKE '%휴먼시아%' 
             OR kapt_name LIKE '%마을%' OR kapt_name REGEXP '[0-9]+단지'
             OR kapt_name LIKE '%임대%' OR kapt_name LIKE '%영구%')
`);

console.log('기타:', noPriceApts.length, '건\n');

// 세부 패턴
const subPatterns = {};
for (const apt of noPriceApts) {
    let pattern = '기타';
    if (/[0-9]+$/.test(apt.kapt_name)) pattern = '숫자로 끝남';
    else if (apt.kapt_name.includes('아파트')) pattern = '아파트 포함';
    else if (apt.kapt_name.includes('자이') || apt.kapt_name.includes('래미안') || apt.kapt_name.includes('힐스')) pattern = '브랜드명';
    else if (/[0-9]+차/.test(apt.kapt_name)) pattern = 'N차';
    else if (apt.kapt_name.length <= 5) pattern = '짧은이름';

    if (!subPatterns[pattern]) subPatterns[pattern] = [];
    subPatterns[pattern].push(apt);
}

console.log('세부 패턴:');
for (const [pattern, apts] of Object.entries(subPatterns)) {
    console.log('  ', pattern + ':', apts.length);
    apts.slice(0, 5).forEach(a => console.log('     -', a.kapt_name));
}

await closeConnection();
