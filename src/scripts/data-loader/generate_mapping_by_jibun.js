/**
 * 지번 기반 apt_name_mapping 자동 생성 스크립트
 * 
 * 이름이 달라도 지번이 일치하면 매핑을 생성합니다.
 * 예: 하마비마을동일하이빌2 (거래) → 동일하이빌2차 (K-apt)
 *     둘 다 언남동 496번지
 * 
 * 사용법:
 *   node src/scripts/data-loader/generate_mapping_by_jibun.js          # DRY RUN
 *   node src/scripts/data-loader/generate_mapping_by_jibun.js --apply  # 실제 적용
 */

import { executeQuery, closeConnection } from './utils/db.js';
import 'dotenv/config';

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 1000;

async function main() {
    console.log('=== 지번 기반 apt_name_mapping 생성 ===\n');

    if (DRY_RUN) {
        console.log('🔍 DRY RUN 모드 (실제 적용: --apply 옵션 추가)\n');
    } else {
        console.log('⚠️  실제 적용 모드\n');
    }

    // 1. 아직 매핑되지 않은 아파트 찾기 (apt_deal_info에 있지만 apt_name_mapping에 없는 것)
    console.log('Step 1: 미매핑 아파트 검색 중...');

    const unmapped = await executeQuery(`
        SELECT DISTINCT 
            d.aptNm, d.sggCd, d.umdNm, d.jibun,
            COUNT(*) as dealCount
        FROM apt_deal_info d
        LEFT JOIN apt_name_mapping m 
            ON d.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
            AND d.sggCd = m.sgg_cd
            AND d.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
        WHERE m.id IS NULL
          AND d.jibun IS NOT NULL AND d.jibun != ''
        GROUP BY d.aptNm, d.sggCd, d.umdNm, d.jibun
        ORDER BY dealCount DESC
    `);

    console.log(`   미매핑 아파트: ${unmapped.length.toLocaleString()}개\n`);

    if (unmapped.length === 0) {
        console.log('✅ 모든 아파트가 이미 매핑되어 있습니다.');
        await closeConnection();
        return;
    }

    // 2. 지번 기반 매칭
    console.log('Step 2: 지번 기반 K-apt 매칭...\n');

    let matched = 0;
    let noMatch = 0;
    let multiMatch = 0;
    const newMappings = [];

    for (let i = 0; i < unmapped.length; i++) {
        const apt = unmapped[i];
        const { aptNm, sggCd, umdNm, jibun, dealCount } = apt;

        // 지번에서 본번만 추출 (123-45 → 123)
        const jibunMain = jibun.split('-')[0].trim();

        // K-apt에서 동 + 지번으로 검색
        const candidates = await executeQuery(`
            SELECT kaptCode, kaptName, kaptdaCnt, kaptAddr
            FROM apt_basic_info
            WHERE kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', ?, '%')
              AND kaptAddr COLLATE utf8mb4_unicode_ci LIKE CONCAT('% ', ?, ' %')
            ORDER BY kaptdaCnt DESC
            LIMIT 3
        `, [umdNm, jibunMain]);

        if (candidates.length === 1) {
            // 정확히 1개 매칭
            newMappings.push({
                dealAptName: aptNm,
                sggCd,
                umdNm,
                jibun,
                kaptCode: candidates[0].kaptCode,
                kaptName: candidates[0].kaptName,
                householdCount: candidates[0].kaptdaCnt,
                dealCount,
                confidence: 0.95
            });
            matched++;
        } else if (candidates.length > 1) {
            // 여러 개 매칭 - 세대수 가장 많은 것 선택
            newMappings.push({
                dealAptName: aptNm,
                sggCd,
                umdNm,
                jibun,
                kaptCode: candidates[0].kaptCode,
                kaptName: candidates[0].kaptName,
                householdCount: candidates[0].kaptdaCnt,
                dealCount,
                confidence: 0.7
            });
            matched++;
            multiMatch++;
        } else {
            noMatch++;
        }

        // 진행률
        if ((i + 1) % 500 === 0 || i === unmapped.length - 1) {
            process.stdout.write(`\r   진행: ${i + 1}/${unmapped.length} | 매칭: ${matched} | 미매칭: ${noMatch}`);
        }
    }

    console.log('\n');

    // 3. 결과 요약
    console.log('=== 결과 ===');
    console.log(`   총 검색: ${unmapped.length.toLocaleString()}`);
    console.log(`   매칭 성공: ${matched.toLocaleString()} (${(matched * 100 / unmapped.length).toFixed(1)}%)`);
    console.log(`   다중 후보: ${multiMatch.toLocaleString()}`);
    console.log(`   매칭 실패: ${noMatch.toLocaleString()}\n`);

    // 이름이 다른 매핑 샘플 출력
    const nameDifferent = newMappings.filter(m =>
        m.dealAptName.replace(/\s/g, '') !== m.kaptName.replace(/\s/g, '')
    );

    if (nameDifferent.length > 0) {
        console.log('=== 이름이 다른 매핑 샘플 (상위 10개) ===');
        nameDifferent.slice(0, 10).forEach((m, i) => {
            console.log(`   ${i + 1}. ${m.dealAptName} (${m.umdNm}, ${m.jibun})`);
            console.log(`      → ${m.kaptName} [${m.kaptCode}] (${m.householdCount}세대)`);
        });
        console.log(`   ... 외 ${nameDifferent.length - 10}건\n`);
    }

    // 4. 적용
    if (!DRY_RUN && newMappings.length > 0) {
        console.log('=== 매핑 적용 중... ===');

        let applied = 0;
        for (const m of newMappings) {
            await executeQuery(`
                INSERT INTO apt_name_mapping (deal_apt_name, sgg_cd, umd_nm, kapt_code, basis_apt_name, mapping_type, confidence_score)
                VALUES (?, ?, ?, ?, ?, 'address', ?)
                ON DUPLICATE KEY UPDATE 
                  kapt_code = VALUES(kapt_code),
                  basis_apt_name = VALUES(basis_apt_name),
                  confidence_score = VALUES(confidence_score),
                  mapping_type = 'address',
                  updated_at = NOW()
            `, [m.dealAptName, m.sggCd, m.umdNm, m.kaptCode, m.kaptName, m.confidence]);

            applied++;
            if (applied % 500 === 0) {
                console.log(`   ${applied}/${newMappings.length} 적용 완료`);
            }
        }

        console.log(`\n✅ ${applied}건 매핑 추가 완료!`);
        console.log('\n💡 사이드바 캐시 갱신이 필요합니다:');
        console.log('   node src/scripts/data-loader/create_sidebar_cache.js');
    } else if (DRY_RUN && newMappings.length > 0) {
        console.log('💡 실제 적용하려면:');
        console.log('   node src/scripts/data-loader/generate_mapping_by_jibun.js --apply');
    }

    await closeConnection();
}

main().catch(e => {
    console.error('오류:', e);
    closeConnection();
    process.exit(1);
});
