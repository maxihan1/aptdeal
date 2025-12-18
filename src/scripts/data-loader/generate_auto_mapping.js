
import { executeQuery, closeConnection } from './utils/db.js';
import { log, logSuccess, logError, logSection } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    logSection("🚀 Auto-generating apt_name_mapping");

    // 1. 실거래가에서 고유한 (aptNm, sggCd, umdNm) 조합 추출
    console.log("Step 1: Extracting unique apartment combinations from apt_deal_info...");

    const uniqueApts = await executeQuery(`
        SELECT DISTINCT aptNm, sggCd, umdNm, COUNT(*) as dealCount
        FROM apt_deal_info
        WHERE aptNm IS NOT NULL AND aptNm != ''
        GROUP BY aptNm, sggCd, umdNm
        ORDER BY dealCount DESC
    `);

    console.log(`Found ${uniqueApts.length} unique apartment combinations.`);

    let autoMapped = 0;
    let noMatch = 0;
    let multiMatch = 0;
    let errors = 0;

    // 2. 각 조합에 대해 K-apt 매칭 시도
    console.log("Step 2: Matching with K-apt data...");

    for (let i = 0; i < uniqueApts.length; i++) {
        const apt = uniqueApts[i];
        const { aptNm, sggCd, umdNm } = apt;

        if (i % 1000 === 0) {
            process.stdout.write(`\rProgress: ${i}/${uniqueApts.length} (Mapped: ${autoMapped}, NoMatch: ${noMatch}, Multi: ${multiMatch})`);
        }

        try {
            // K-apt에서 동일 동 + 이름 포함 검색
            const candidates = await executeQuery(`
                SELECT kaptCode, kaptName, kaptdaCnt
                FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND (
                    REPLACE(kaptName, ' ', '') = REPLACE(?, ' ', '') COLLATE utf8mb4_unicode_ci
                    OR REPLACE(kaptName, ' ', '') = CONCAT(REPLACE(?, ' ', ''), '아파트') COLLATE utf8mb4_unicode_ci
                    OR kaptName LIKE CONCAT('%', ?, '%')
                  )
                ORDER BY 
                  CASE 
                    WHEN REPLACE(kaptName, ' ', '') = REPLACE(?, ' ', '') THEN 1
                    WHEN REPLACE(kaptName, ' ', '') = CONCAT(REPLACE(?, ' ', ''), '아파트') THEN 2
                    ELSE 3
                  END,
                  kaptdaCnt DESC
                LIMIT 5
            `, [umdNm, aptNm, aptNm, aptNm, aptNm, aptNm]);

            if (candidates.length === 0) {
                noMatch++;
                continue;
            }

            if (candidates.length === 1) {
                // 정확히 1개 매칭 → 자동 매핑
                await insertMapping(aptNm, sggCd, umdNm, candidates[0].kaptCode, candidates[0].kaptName, 'auto', 1.0);
                autoMapped++;
            } else {
                // 여러 개 후보 → 이름이 정확히 일치하는 것만 선택
                const exactMatch = candidates.find(c =>
                    c.kaptName.replace(/\s+/g, '').toLowerCase() === aptNm.replace(/\s+/g, '').toLowerCase()
                    || c.kaptName.replace(/\s+/g, '').toLowerCase() === (aptNm + '아파트').replace(/\s+/g, '').toLowerCase()
                );

                if (exactMatch) {
                    await insertMapping(aptNm, sggCd, umdNm, exactMatch.kaptCode, exactMatch.kaptName, 'auto', 0.95);
                    autoMapped++;
                } else {
                    // 정확 매칭 없으면 세대수 가장 많은 것 선택 (낮은 신뢰도)
                    await insertMapping(aptNm, sggCd, umdNm, candidates[0].kaptCode, candidates[0].kaptName, 'auto', 0.7);
                    autoMapped++;
                    multiMatch++;
                }
            }
        } catch (e) {
            if (!e.message.includes('Duplicate entry')) {
                errors++;
            }
        }
    }

    console.log(`\n\n=== Results ===`);
    console.log(`Total unique apartments: ${uniqueApts.length}`);
    console.log(`Auto-mapped: ${autoMapped}`);
    console.log(`No match found: ${noMatch}`);
    console.log(`Multi-match (low confidence): ${multiMatch}`);
    console.log(`Errors: ${errors}`);

    logSuccess("Mapping generation completed!");
    await closeConnection();
}

async function insertMapping(aptNm, sggCd, umdNm, kaptCode, basisAptName, mappingType, confidence) {
    await executeQuery(`
        INSERT INTO apt_name_mapping (deal_apt_name, sgg_cd, umd_nm, kapt_code, basis_apt_name, mapping_type, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          kapt_code = VALUES(kapt_code),
          basis_apt_name = VALUES(basis_apt_name),
          confidence_score = VALUES(confidence_score),
          updated_at = NOW()
    `, [aptNm, sggCd, umdNm, kaptCode, basisAptName, mappingType === 'auto' ? 'normalized' : 'manual', confidence]);
}

main().catch(console.error);
