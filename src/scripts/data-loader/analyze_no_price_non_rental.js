import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

console.log('=== 가격 없음 + 비임대 패턴 분석 ===\n');

const noPriceNonRental = await executeQuery(`
  SELECT pc.kapt_code, pc.kapt_name, b.codeSaleNm, b.kaptdaCnt, b.kaptUsedate
  FROM apt_price_cache pc
  JOIN apt_basic_info b ON pc.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
  WHERE (pc.avg_price_365d = 0 OR pc.avg_price_365d IS NULL) 
    AND (pc.last_deal_price = 0 OR pc.last_deal_price IS NULL)
    AND pc.is_rental = FALSE
  ORDER BY b.kaptdaCnt DESC
`);

console.log('총:', noPriceNonRental.length, '건\n');

// codeSaleNm 분포
const byType = {};
noPriceNonRental.forEach(a => {
    const type = a.codeSaleNm || '(null)';
    byType[type] = (byType[type] || 0) + 1;
});
console.log('codeSaleNm 분포:');
Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// 준공연도 분포
console.log('\n준공연도 분포:');
const byYear = { '2024+': 0, '2020-2023': 0, '2010-2019': 0, '2000-2009': 0, '~1999': 0, 'null': 0 };
noPriceNonRental.forEach(a => {
    const year = a.kaptUsedate ? parseInt(a.kaptUsedate.substring(0, 4)) : null;
    if (!year) byYear['null']++;
    else if (year >= 2024) byYear['2024+']++;
    else if (year >= 2020) byYear['2020-2023']++;
    else if (year >= 2010) byYear['2010-2019']++;
    else if (year >= 2000) byYear['2000-2009']++;
    else byYear['~1999']++;
});
Object.entries(byYear).forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// Top 15 (세대수 많은)
console.log('\nTop 15 (세대수 많은):');
noPriceNonRental.slice(0, 15).forEach(a => {
    console.log('  ' + a.kaptdaCnt + '세대 | ' + a.kapt_name + ' | ' + a.codeSaleNm + ' | ' + (a.kaptUsedate || '-'));
});

await closeConnection();
