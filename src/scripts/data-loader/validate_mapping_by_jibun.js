/**
 * 지번(jibun) 기반 매핑 검증 스크립트
 * 
 * 문제: apt_name_mapping이 동+아파트명만으로 매핑되어 있어서
 *       같은 동에 비슷한 이름의 아파트가 여러 개 있을 때 잘못된 매핑 발생
 * 
 * 해결: 실거래 데이터의 jibun과 K-apt 주소의 jibun을 비교하여
 *       불일치하는 매핑을 찾아 수정
 */

import { executeQuery, closeConnection } from './utils/db.js';

async function main() {
    console.log('=== 지번 기반 매핑 검증 시작 ===\n');

    // 1. 현재 매핑된 아파트 중 지번 불일치 찾기
    // 실거래 데이터의 jibun과 K-apt 주소의 jibun 비교
    const mismatches = await executeQuery(`
    SELECT 
      m.deal_apt_name,
      m.umd_nm,
      m.kapt_code,
      b.kaptName,
      b.kaptdaCnt,
      b.kaptAddr,
      -- 실거래 데이터에서 대표 jibun 추출
      (SELECT DISTINCT jibun FROM apt_deal_info 
       WHERE aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
       AND umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
       AND jibun IS NOT NULL AND jibun != ''
       LIMIT 1) as deal_jibun,
      -- K-apt 주소에 지번이 포함되어 있는지 확인
      CASE 
        WHEN b.kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', 
          (SELECT DISTINCT jibun FROM apt_deal_info 
           WHERE aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci 
           AND umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
           AND jibun IS NOT NULL AND jibun != ''
           LIMIT 1), '%') 
        THEN 'MATCH'
        ELSE 'MISMATCH'
      END as jibun_status
    FROM apt_name_mapping m
    JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
    ORDER BY m.umd_nm, m.deal_apt_name
  `);

    // 불일치 케이스만 필터링
    const mismatchList = mismatches.filter(row =>
        row.deal_jibun && row.jibun_status === 'MISMATCH'
    );

    console.log(`총 매핑 건수: ${mismatches.length}`);
    console.log(`지번 정보 있는 건수: ${mismatches.filter(r => r.deal_jibun).length}`);
    console.log(`지번 불일치 건수: ${mismatchList.length}\n`);

    if (mismatchList.length === 0) {
        console.log('✅ 지번 불일치 케이스가 없습니다!');
        await closeConnection();
        return;
    }

    console.log('=== 지번 불일치 목록 ===\n');

    const fixCandidates = [];

    for (const row of mismatchList) {
        console.log(`❌ ${row.deal_apt_name} (${row.umd_nm})`);
        console.log(`   현재 매핑: ${row.kaptName} (${row.kaptdaCnt}세대)`);
        console.log(`   K-apt 주소: ${row.kaptAddr}`);
        console.log(`   실거래 지번: ${row.deal_jibun}`);

        // 올바른 매핑 후보 찾기 (같은 동 + 지번 일치)
        const candidates = await executeQuery(`
      SELECT kaptCode, kaptName, kaptdaCnt, kaptAddr
      FROM apt_basic_info
      WHERE kaptAddr LIKE CONCAT('%', ?, '%')
        AND kaptAddr LIKE CONCAT('%', ?, '%')
      ORDER BY kaptdaCnt DESC
      LIMIT 3
    `, [row.umd_nm, row.deal_jibun]);

        if (candidates.length > 0) {
            console.log(`   ✅ 올바른 후보:`);
            candidates.forEach((c, idx) => {
                console.log(`      ${idx + 1}. [${c.kaptCode}] ${c.kaptName} (${c.kaptdaCnt}세대) - ${c.kaptAddr}`);
            });

            // 가장 유력한 후보 저장
            fixCandidates.push({
                deal_apt_name: row.deal_apt_name,
                umd_nm: row.umd_nm,
                old_kapt_code: row.kapt_code,
                old_kapt_name: row.kaptName,
                new_kapt_code: candidates[0].kaptCode,
                new_kapt_name: candidates[0].kaptName,
                new_household: candidates[0].kaptdaCnt,
                jibun: row.deal_jibun
            });
        } else {
            console.log(`   ⚠️ 지번 ${row.deal_jibun}과 일치하는 K-apt 아파트 없음`);
        }
        console.log('');
    }

    // 수정 대상 요약
    console.log('\n=== 자동 수정 가능 목록 ===\n');
    fixCandidates.forEach((fix, idx) => {
        console.log(`${idx + 1}. ${fix.deal_apt_name} (${fix.umd_nm}, 지번 ${fix.jibun})`);
        console.log(`   [${fix.old_kapt_code}] ${fix.old_kapt_name}`);
        console.log(`   → [${fix.new_kapt_code}] ${fix.new_kapt_name} (${fix.new_household}세대)`);
    });

    console.log(`\n총 ${fixCandidates.length}건 자동 수정 가능`);

    // DRY RUN 모드 - 실제 수정하려면 --fix 옵션 추가
    if (process.argv.includes('--fix')) {
        console.log('\n=== 수정 실행 중... ===\n');

        for (const fix of fixCandidates) {
            await executeQuery(`
        UPDATE apt_name_mapping 
        SET kapt_code = ?, confidence_score = 1.00
        WHERE deal_apt_name = ? AND umd_nm = ?
      `, [fix.new_kapt_code, fix.deal_apt_name, fix.umd_nm]);

            await executeQuery(`
        UPDATE apt_search_index 
        SET householdCount = ?
        WHERE aptNm = ? AND umdNm = ?
      `, [fix.new_household, fix.deal_apt_name, fix.umd_nm]);

            console.log(`✅ ${fix.deal_apt_name} (${fix.umd_nm}) 수정 완료`);
        }

        console.log('\n🎉 모든 수정 완료!');
    } else {
        console.log('\n💡 실제 수정하려면 --fix 옵션을 추가하세요:');
        console.log('   node src/scripts/data-loader/validate_mapping_by_jibun.js --fix');
    }

    await closeConnection();
}

main().catch(console.error);
