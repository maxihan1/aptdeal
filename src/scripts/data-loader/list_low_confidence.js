
import { executeQuery, closeConnection } from './utils/db.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    console.log("\n========================================");
    console.log("   🔍 낮은 신뢰도 매핑 검토 리스트");
    console.log("========================================\n");

    // 낮은 신뢰도 매핑 조회
    const threshold = 0.8;
    const lowConfMappings = await executeQuery(`
        SELECT m.id, m.deal_apt_name, m.sgg_cd, m.umd_nm, m.kapt_code, m.basis_apt_name, 
               m.confidence_score, b.kaptdaCnt
        FROM apt_name_mapping m
        LEFT JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
        WHERE m.confidence_score < ?
        ORDER BY m.confidence_score ASC, m.deal_apt_name
        LIMIT 50
    `, [threshold]);

    if (lowConfMappings.length === 0) {
        console.log("✅ 낮은 신뢰도 매핑이 없습니다!");
        await closeConnection();
        return;
    }

    console.log(`총 ${lowConfMappings.length}건 (신뢰도 < ${threshold})\n`);

    for (let i = 0; i < lowConfMappings.length; i++) {
        const m = lowConfMappings[i];
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[${i + 1}] ${m.deal_apt_name} (${m.umd_nm})`);
        console.log(`    현재 매핑: ${m.basis_apt_name} (${m.kaptdaCnt}세대) [신뢰도: ${m.confidence_score}]`);
        console.log(`    DB ID: ${m.id}, kaptCode: ${m.kapt_code}`);

        // 같은 동의 다른 후보들 조회
        const candidates = await executeQuery(`
            SELECT kaptCode, kaptName, kaptdaCnt
            FROM apt_basic_info
            WHERE kaptAddr LIKE CONCAT('%', ?, '%')
              AND (kaptName LIKE CONCAT('%', ?, '%') OR kaptName LIKE CONCAT(?, '%'))
            ORDER BY 
              CASE WHEN REPLACE(kaptName, ' ', '') = REPLACE(?, ' ', '') THEN 0 ELSE 1 END,
              kaptdaCnt DESC
            LIMIT 5
        `, [m.umd_nm, m.deal_apt_name, m.deal_apt_name, m.deal_apt_name]);

        if (candidates.length > 0) {
            console.log(`    [후보]`);
            candidates.forEach((c, j) => {
                const isCurrent = c.kaptCode === m.kapt_code ? " ← 현재" : "";
                console.log(`      ${String.fromCharCode(65 + j)}. ${c.kaptName} (${c.kaptdaCnt}세대) [${c.kaptCode}]${isCurrent}`);
            });
        } else {
            console.log(`    [후보] (없음)`);
        }
        console.log("");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n사용법: '1번을 B로 변경해줘' 또는 '3번 삭제해줘' 라고 말씀해주세요.");
    console.log("AI가 직접 UPDATE/DELETE 쿼리를 실행합니다.\n");

    await closeConnection();
}

main().catch(console.error);
