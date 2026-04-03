/**
 * 20_analyze_missing_danji.js
 * 
 * 누락된 아파트 단지 현황 분석 스크립트
 * - 실거래에 있지만 매핑이 없는 단지 파악
 * - 거래량 기준 우선순위 정렬
 * - 지역별 분포 분석
 * - apt_basic_info 존재 여부 교차 확인
 * 
 * 실행: node src/scripts/data-loader/20_analyze_missing_danji.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('=============================================================');
    console.log('  🔍 누락 단지 현황 분석');
    console.log('  분석 시간:', new Date().toISOString());
    console.log('=============================================================\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('DB 연결 실패');
        process.exit(1);
    }

    // ─────────────────────────────────────────────────
    // 1. 전체 현황
    // ─────────────────────────────────────────────────
    console.log('━━━ 1. 전체 현황 ━━━\n');

    const [totalDeals] = await executeQuery(`SELECT COUNT(DISTINCT aptNm, sggCd, umdNm) as cnt FROM apt_deal_info`);
    const [totalMapped] = await executeQuery(`SELECT COUNT(*) as cnt FROM apt_name_mapping`);
    const [totalBasicInfo] = await executeQuery(`SELECT COUNT(*) as cnt FROM apt_basic_info`);
    const [totalSearchIndex] = await executeQuery(`SELECT COUNT(*) as cnt FROM apt_search_index`);

    console.log(`   실거래 고유 단지: ${totalDeals.cnt.toLocaleString()}개`);
    console.log(`   apt_name_mapping: ${totalMapped.cnt.toLocaleString()}개`);
    console.log(`   apt_basic_info:   ${totalBasicInfo.cnt.toLocaleString()}개`);
    console.log(`   apt_search_index: ${totalSearchIndex.cnt.toLocaleString()}개`);
    console.log(`   매핑률: ${((totalMapped.cnt / totalDeals.cnt) * 100).toFixed(1)}%\n`);

    // ─────────────────────────────────────────────────
    // 2. 미매핑 단지 목록 (거래량 순)
    // ─────────────────────────────────────────────────
    console.log('━━━ 2. 미매핑 단지 (거래량 상위 30) ━━━\n');

    const unmapped = await executeQuery(`
        SELECT 
            d.aptNm, d.sggCd, d.umdNm, d.jibun,
            COUNT(*) as dealCount,
            MIN(d.dealYear) as firstYear,
            MAX(d.dealYear) as lastYear,
            MAX(d.buildYear) as buildYear,
            ROUND(AVG(d.dealAmount)) as avgPrice
        FROM apt_deal_info d
        LEFT JOIN apt_name_mapping m 
            ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
            AND d.sggCd = m.sgg_cd
            AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
        WHERE m.id IS NULL
          AND d.aptNm IS NOT NULL AND d.aptNm != ''
        GROUP BY d.aptNm, d.sggCd, d.umdNm, d.jibun
        ORDER BY dealCount DESC
        LIMIT 30
    `);

    console.log(`   순위 | 아파트명 | 동 | 거래수 | 기간 | 평균가(만)`);
    console.log('   ' + '-'.repeat(75));
    unmapped.forEach((apt, i) => {
        console.log(`   ${String(i + 1).padStart(3)}. ${apt.aptNm.padEnd(20)} ${apt.umdNm.padEnd(8)} ${String(apt.dealCount).padStart(5)}건  ${apt.firstYear}-${apt.lastYear}  ${apt.avgPrice ? Math.round(apt.avgPrice).toLocaleString() : 'N/A'}`);
    });

    // ─────────────────────────────────────────────────
    // 3. 전체 미매핑 단지 통계
    // ─────────────────────────────────────────────────
    console.log('\n━━━ 3. 미매핑 단지 전체 통계 ━━━\n');

    const unmappedAll = await executeQuery(`
        SELECT COUNT(DISTINCT d.aptNm, d.sggCd, d.umdNm) as unmappedCount,
               SUM(cnt) as totalDeals
        FROM (
            SELECT d.aptNm, d.sggCd, d.umdNm, COUNT(*) as cnt
            FROM apt_deal_info d
            LEFT JOIN apt_name_mapping m 
                ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND d.sggCd = m.sgg_cd
                AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            WHERE m.id IS NULL
              AND d.aptNm IS NOT NULL AND d.aptNm != ''
            GROUP BY d.aptNm, d.sggCd, d.umdNm
        ) d
    `);

    console.log(`   미매핑 단지 수: ${unmappedAll[0].unmappedCount.toLocaleString()}개`);
    console.log(`   미매핑 거래 건수: ${unmappedAll[0].totalDeals.toLocaleString()}건\n`);

    // ─────────────────────────────────────────────────
    // 4. apt_basic_info 교차 확인
    //    미매핑이지만 apt_basic_info에 이름이 존재하는 경우
    // ─────────────────────────────────────────────────
    console.log('━━━ 4. apt_basic_info 교차 분석 ━━━\n');

    const unmappedWithBasicInfo = await executeQuery(`
        SELECT 
            d.aptNm, d.umdNm, d.sggCd, d.cnt as dealCount,
            b.kaptCode, b.kaptName, b.kaptdaCnt as household
        FROM (
            SELECT aptNm, umdNm, sggCd, COUNT(*) as cnt
            FROM apt_deal_info d2
            LEFT JOIN apt_name_mapping m 
                ON d2.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND d2.sggCd = m.sgg_cd
                AND d2.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            WHERE m.id IS NULL
              AND d2.aptNm IS NOT NULL AND d2.aptNm != ''
            GROUP BY d2.aptNm, d2.umdNm, d2.sggCd
            ORDER BY cnt DESC
        ) d
        JOIN apt_basic_info b 
            ON REPLACE(b.kaptName, ' ', '') COLLATE utf8mb4_unicode_ci 
             = REPLACE(d.aptNm, ' ', '') COLLATE utf8mb4_unicode_ci
            AND b.kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', d.umdNm COLLATE utf8mb4_unicode_ci, '%')
        ORDER BY d.cnt DESC
        LIMIT 20
    `);

    console.log(`   매핑 없지만 apt_basic_info에 이름 존재: ${unmappedWithBasicInfo.length}건 (상위 20개)\n`);

    if (unmappedWithBasicInfo.length > 0) {
        console.log(`   이름(실거래) → 이름(K-apt) | 동 | 거래수 | 세대수`);
        console.log('   ' + '-'.repeat(75));
        unmappedWithBasicInfo.forEach(apt => {
            console.log(`   ${apt.aptNm} → ${apt.kaptName} | ${apt.umdNm} | ${apt.dealCount}건 | ${apt.household}세대`);
        });
    }

    // ─────────────────────────────────────────────────
    // 5. 지역별 미매핑 분포
    // ─────────────────────────────────────────────────
    console.log('\n━━━ 5. 지역별 미매핑 분포 (시군구 코드 기준 상위 15) ━━━\n');

    const regionDist = await executeQuery(`
        SELECT 
            d.sggCd,
            l.as1 as sido, l.as2 as sigungu,
            COUNT(DISTINCT d.aptNm, d.umdNm) as unmappedCount,
            SUM(d.cnt) as totalDeals
        FROM (
            SELECT aptNm, umdNm, sggCd, COUNT(*) as cnt
            FROM apt_deal_info d2
            LEFT JOIN apt_name_mapping m 
                ON d2.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND d2.sggCd = m.sgg_cd
                AND d2.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            WHERE m.id IS NULL
              AND d2.aptNm IS NOT NULL AND d2.aptNm != ''
            GROUP BY d2.aptNm, d2.umdNm, d2.sggCd
        ) d
        LEFT JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2 FROM apt_list
        ) l ON d.sggCd = l.sggCode
        GROUP BY d.sggCd, l.as1, l.as2
        ORDER BY unmappedCount DESC
        LIMIT 15
    `);

    console.log(`   시도 | 시군구 | 미매핑 | 누적 거래`);
    console.log('   ' + '-'.repeat(55));
    regionDist.forEach(r => {
        console.log(`   ${(r.sido || '?').padEnd(10)} ${(r.sigungu || r.sggCd).padEnd(12)} ${String(r.unmappedCount).padStart(5)}개  ${String(r.totalDeals).padStart(8)}건`);
    });

    // ─────────────────────────────────────────────────
    // 6. 미매핑 단지 유형 분류
    // ─────────────────────────────────────────────────
    console.log('\n━━━ 6. 미매핑 원인 유형 분류 ━━━\n');

    // 유형 A: apt_basic_info에 정확한 이름이 있음 → 매핑만 생성하면 됨
    const [typeA] = await executeQuery(`
        SELECT COUNT(DISTINCT d.aptNm, d.sggCd, d.umdNm) as cnt
        FROM apt_deal_info d
        LEFT JOIN apt_name_mapping m 
            ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
            AND d.sggCd = m.sgg_cd
        WHERE m.id IS NULL AND d.aptNm IS NOT NULL AND d.aptNm != ''
          AND EXISTS (
            SELECT 1 FROM apt_basic_info b 
            WHERE REPLACE(b.kaptName, ' ', '') COLLATE utf8mb4_unicode_ci 
                = REPLACE(d.aptNm, ' ', '') COLLATE utf8mb4_unicode_ci
          )
    `);

    // 유형 B: apt_basic_info에 유사한 이름이 있음 → 정규화 매칭 필요
    const [typeB] = await executeQuery(`
        SELECT COUNT(DISTINCT d.aptNm, d.sggCd, d.umdNm) as cnt
        FROM apt_deal_info d
        LEFT JOIN apt_name_mapping m 
            ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
            AND d.sggCd = m.sgg_cd
        WHERE m.id IS NULL AND d.aptNm IS NOT NULL AND d.aptNm != ''
          AND NOT EXISTS (
            SELECT 1 FROM apt_basic_info b 
            WHERE REPLACE(b.kaptName, ' ', '') COLLATE utf8mb4_unicode_ci 
                = REPLACE(d.aptNm, ' ', '') COLLATE utf8mb4_unicode_ci
          )
          AND EXISTS (
            SELECT 1 FROM apt_basic_info b 
            WHERE b.kaptName COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', LEFT(d.aptNm, 3), '%')
              AND b.kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', d.umdNm COLLATE utf8mb4_unicode_ci, '%')
          )
    `);

    const typeCCount = unmappedAll[0].unmappedCount - typeA.cnt - typeB.cnt;

    console.log(`   유형 A (이름 정확 일치, 매핑만 필요):  ${typeA.cnt.toLocaleString()}개`);
    console.log(`   유형 B (이름 유사, 정규화 매칭 필요):  ${typeB.cnt.toLocaleString()}개`);
    console.log(`   유형 C (크롤링 필요, 외부 소스 활용):  ${typeCCount.toLocaleString()}개\n`);

    // ─────────────────────────────────────────────────
    // 7. 결과 저장
    // ─────────────────────────────────────────────────
    console.log('━━━ 7. 미매핑 목록 파일 저장 ━━━\n');

    const fullUnmapped = await executeQuery(`
        SELECT 
            d.aptNm, d.sggCd, d.umdNm, d.jibun,
            COUNT(*) as dealCount,
            MAX(d.buildYear) as buildYear
        FROM apt_deal_info d
        LEFT JOIN apt_name_mapping m 
            ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
            AND d.sggCd = m.sgg_cd
            AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
        WHERE m.id IS NULL
          AND d.aptNm IS NOT NULL AND d.aptNm != ''
        GROUP BY d.aptNm, d.sggCd, d.umdNm, d.jibun
        ORDER BY dealCount DESC
    `);

    const outputPath = path.join(__dirname, 'logs', `unmapped_danji_${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(fullUnmapped, null, 2), 'utf8');
    console.log(`   ✅ 미매핑 목록 저장: ${outputPath}`);
    console.log(`   총 ${fullUnmapped.length.toLocaleString()}건\n`);

    // ─────────────────────────────────────────────────
    // 요약
    // ─────────────────────────────────────────────────
    console.log('=============================================================');
    console.log('  📊 분석 요약');
    console.log('=============================================================');
    console.log(`  전체 단지: ${totalDeals.cnt.toLocaleString()}개`);
    console.log(`  매핑 완료: ${totalMapped.cnt.toLocaleString()}개 (${((totalMapped.cnt / totalDeals.cnt) * 100).toFixed(1)}%)`);
    console.log(`  미매핑:    ${unmappedAll[0].unmappedCount.toLocaleString()}개 (${((unmappedAll[0].unmappedCount / totalDeals.cnt) * 100).toFixed(1)}%)`);
    console.log('');
    console.log('  💡 권장 다음 단계:');
    console.log('     1. node src/scripts/data-loader/21_crawl_hogang_missing.js  (호갱노노 크롤링)');
    console.log('     2. node src/scripts/data-loader/22_auto_mapping_pipeline.js (자동 매핑)');
    console.log('=============================================================\n');

    await closeConnection();
}

main().catch(err => {
    console.error('스크립트 오류:', err);
    process.exit(1);
});
