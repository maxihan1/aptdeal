
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError, logSection } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    logSection("🚀 준공년도 기반 매핑 검증 (최적화 버전)");

    // 1. 한번의 쿼리로 모든 정보를 조인!
    // - apt_name_mapping의 낮은 신뢰도 매핑
    // - apt_deal_info의 buildYear
    // - apt_basic_info의 kaptUsedate (API 호출 불필요!)
    console.log("\n1단계: 데이터 조회 중...");

    const query = `
        SELECT 
            m.id,
            m.deal_apt_name,
            m.umd_nm,
            m.kapt_code,
            m.basis_apt_name,
            m.confidence_score,
            d.buildYear as deal_buildYear,
            b.kaptUsedate,
            LEFT(b.kaptUsedate, 4) as kapt_year
        FROM apt_name_mapping m
        LEFT JOIN (
            SELECT aptNm, umdNm, MAX(buildYear) as buildYear
            FROM apt_deal_info
            WHERE buildYear IS NOT NULL
            GROUP BY aptNm, umdNm
        ) d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_unicode_ci 
           AND m.umd_nm = d.umdNm COLLATE utf8mb4_unicode_ci
        LEFT JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
        WHERE m.confidence_score < 0.8
    `;

    const mappings = await executeQuery(query);
    console.log(`총 ${mappings.length}건 조회됨`);

    // 2. 준공년도 일치 확인 및 업데이트
    console.log("\n2단계: 준공년도 비교 및 업데이트 중...");

    let matched = 0;
    let mismatched = 0;
    let noBuildYear = 0;
    let noKaptYear = 0;

    const matchedIds = [];
    const mismatchedList = [];

    for (const m of mappings) {
        const dealYear = m.deal_buildYear ? String(m.deal_buildYear) : null;
        const kaptYear = m.kapt_year;

        if (!dealYear) {
            noBuildYear++;
            continue;
        }

        if (!kaptYear) {
            noKaptYear++;
            continue;
        }

        if (dealYear === kaptYear) {
            matched++;
            matchedIds.push(m.id);
        } else {
            mismatched++;
            mismatchedList.push({
                id: m.id,
                name: m.deal_apt_name,
                dong: m.umd_nm,
                basisName: m.basis_apt_name,
                dealYear,
                kaptYear
            });
        }
    }

    // 3. 일치하는 것들 배치 업데이트
    if (matchedIds.length > 0) {
        console.log(`\n일치하는 ${matchedIds.length}건 배치 업데이트 중...`);

        // 1000건씩 배치 처리
        const batchSize = 1000;
        for (let i = 0; i < matchedIds.length; i += batchSize) {
            const batch = matchedIds.slice(i, i + batchSize);
            await executeQuery(`
                UPDATE apt_name_mapping 
                SET confidence_score = 1.0, updated_at = NOW()
                WHERE id IN (${batch.join(',')})
            `);
            process.stdout.write(`\r업데이트: ${Math.min(i + batchSize, matchedIds.length)}/${matchedIds.length}`);
        }
        console.log("");
    }

    // 4. 결과 출력
    console.log("\n" + "=".repeat(50));
    console.log("결과:");
    console.log(`  ✅ 준공년도 일치 (신뢰도 1.0으로 업데이트): ${matched}건`);
    console.log(`  ⚠️ 준공년도 불일치: ${mismatched}건`);
    console.log(`  ⏭️ 실거래 buildYear 없음: ${noBuildYear}건`);
    console.log(`  ⏭️ K-apt kaptUsedate 없음: ${noKaptYear}건`);

    // 5. 불일치 케이스 일부 출력 (수동 검토용)
    if (mismatchedList.length > 0) {
        console.log("\n불일치 케이스 (상위 10건):");
        mismatchedList.slice(0, 10).forEach(m => {
            console.log(`  [${m.id}] ${m.name}(${m.dong}) → ${m.basisName} | 실거래:${m.dealYear} vs K-apt:${m.kaptYear}`);
        });
    }

    logSuccess("완료!");
    await closeConnection();
}

main().catch(console.error);
