
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError, logSection } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    logSection("🔧 낮은 신뢰도 매핑 자동 수정");

    // 1. 낮은 신뢰도 매핑 조회
    const threshold = 0.8;
    console.log(`\n신뢰도 < ${threshold} 매핑 조회 중...`);

    const lowConfMappings = await executeQuery(`
        SELECT m.id, m.deal_apt_name, m.sgg_cd, m.umd_nm, m.kapt_code, m.basis_apt_name, m.confidence_score
        FROM apt_name_mapping m
        WHERE m.confidence_score < ?
        ORDER BY m.id
    `, [threshold]);

    console.log(`총 ${lowConfMappings.length}건 발견\n`);

    let fixed = 0;
    let unchanged = 0;
    let notFound = 0;

    for (const m of lowConfMappings) {
        // 2. 정확한 매칭 시도 (여러 조건 순서대로)
        const dealName = m.deal_apt_name;
        const umdNm = m.umd_nm;
        const cleanDealName = dealName.replace(/\s+/g, '').toLowerCase();

        // 조건 1: 이름 정확 일치 + 동 일치
        let match = await executeQuery(`
            SELECT kaptCode, kaptName, kaptdaCnt
            FROM apt_basic_info
            WHERE kaptAddr LIKE CONCAT('%', ?, '%')
              AND (
                REPLACE(kaptName, ' ', '') = ? COLLATE utf8mb4_unicode_ci
                OR REPLACE(kaptName, ' ', '') = CONCAT(?, '아파트') COLLATE utf8mb4_unicode_ci
              )
            ORDER BY kaptdaCnt DESC
            LIMIT 1
        `, [umdNm, cleanDealName, cleanDealName]);

        // 조건 2: 동 + 이름 조합 (예: 신현동 + 효성 → 신현효성)
        if (match.length === 0) {
            const combinedName = umdNm.replace(/동$|읍$|면$|리$/, '') + dealName;
            match = await executeQuery(`
                SELECT kaptCode, kaptName, kaptdaCnt
                FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
                ORDER BY 
                  CASE WHEN REPLACE(kaptName, ' ', '') = ? THEN 0 ELSE 1 END,
                  kaptdaCnt DESC
                LIMIT 1
            `, [umdNm, combinedName.replace(/\s+/g, ''), combinedName.replace(/\s+/g, '')]);
        }

        // 조건 3: 이름 + 동 조합 (예: 효성 + 신현 → 효성신현, 신현효성)
        if (match.length === 0) {
            const dongPrefix = umdNm.replace(/동$|읍$|면$|리$/, '');
            match = await executeQuery(`
                SELECT kaptCode, kaptName, kaptdaCnt
                FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND (
                    REPLACE(kaptName, ' ', '') LIKE CONCAT(?, '%', ?) COLLATE utf8mb4_unicode_ci
                    OR REPLACE(kaptName, ' ', '') LIKE CONCAT(?, '%') COLLATE utf8mb4_unicode_ci
                  )
                ORDER BY kaptdaCnt DESC
                LIMIT 1
            `, [umdNm, dongPrefix, cleanDealName, dongPrefix + cleanDealName]);
        }

        if (match.length > 0 && match[0].kaptCode !== m.kapt_code) {
            // 더 좋은 매칭 발견 → 업데이트
            await executeQuery(`
                UPDATE apt_name_mapping 
                SET kapt_code = ?, basis_apt_name = ?, confidence_score = 0.95, updated_at = NOW()
                WHERE id = ?
            `, [match[0].kaptCode, match[0].kaptName, m.id]);

            console.log(`✅ [${m.id}] ${dealName}(${umdNm}): ${m.basis_apt_name} → ${match[0].kaptName}`);
            fixed++;
        } else if (match.length > 0 && match[0].kaptCode === m.kapt_code) {
            // 현재 매핑이 이미 최선
            unchanged++;
        } else {
            // 매칭 못 찾음
            notFound++;
        }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`결과: 수정됨 ${fixed}, 변경없음 ${unchanged}, 매칭실패 ${notFound}`);
    logSuccess("자동 수정 완료!");

    await closeConnection();
}

main().catch(console.error);
