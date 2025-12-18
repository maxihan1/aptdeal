
import { executeQuery, closeConnection } from './utils/db.js';
import { logSection, logSuccess, logError } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    logSection("🔍 Low Confidence Mapping Review Tool");

    // 1. 낮은 신뢰도 매핑 조회
    const threshold = 0.8;
    console.log(`\nFetching mappings with confidence < ${threshold}...\n`);

    const lowConfMappings = await executeQuery(`
        SELECT m.id, m.deal_apt_name, m.sgg_cd, m.umd_nm, m.kapt_code, m.basis_apt_name, 
               m.confidence_score, m.mapping_type,
               b.kaptdaCnt, b.kaptAddr
        FROM apt_name_mapping m
        LEFT JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
        WHERE m.confidence_score < ?
        ORDER BY m.confidence_score ASC, m.deal_apt_name
        LIMIT 100
    `, [threshold]);

    if (lowConfMappings.length === 0) {
        console.log("✅ No low confidence mappings found!");
        rl.close();
        await closeConnection();
        return;
    }

    console.log(`Found ${lowConfMappings.length} low confidence mappings:\n`);
    console.log("━".repeat(100));
    console.log(`${"ID".padEnd(6)} | ${"신뢰도".padEnd(6)} | ${"실거래명".padEnd(20)} | ${"동".padEnd(12)} | ${"K-apt명".padEnd(25)} | 세대수`);
    console.log("━".repeat(100));

    for (const m of lowConfMappings) {
        console.log(
            `${String(m.id).padEnd(6)} | ` +
            `${String(m.confidence_score).padEnd(6)} | ` +
            `${(m.deal_apt_name || '').substring(0, 20).padEnd(20)} | ` +
            `${(m.umd_nm || '').substring(0, 12).padEnd(12)} | ` +
            `${(m.basis_apt_name || '').substring(0, 25).padEnd(25)} | ` +
            `${m.kaptdaCnt || 'N/A'}`
        );
    }
    console.log("━".repeat(100));

    // 2. 수정할 항목 선택
    console.log("\n옵션:");
    console.log("  [ID 입력] - 해당 매핑을 수정");
    console.log("  [q] - 종료");
    console.log("  [export] - CSV로 내보내기\n");

    while (true) {
        const input = await question("선택 (ID/q/export): ");

        if (input.toLowerCase() === 'q') {
            break;
        }

        if (input.toLowerCase() === 'export') {
            await exportToCsv(lowConfMappings);
            continue;
        }

        const id = parseInt(input);
        if (isNaN(id)) {
            console.log("올바른 ID를 입력하세요.");
            continue;
        }

        const mapping = lowConfMappings.find(m => m.id === id);
        if (!mapping) {
            console.log("해당 ID를 찾을 수 없습니다.");
            continue;
        }

        await reviewMapping(mapping);
    }

    rl.close();
    await closeConnection();
    console.log("\n👋 종료합니다.");
}

async function reviewMapping(mapping) {
    console.log("\n" + "=".repeat(80));
    console.log(`📋 매핑 검토: ${mapping.deal_apt_name} (${mapping.umd_nm})`);
    console.log("=".repeat(80));
    console.log(`현재 매핑: ${mapping.basis_apt_name} (${mapping.kaptdaCnt}세대)`);
    console.log(`신뢰도: ${mapping.confidence_score}`);
    console.log(`주소: ${mapping.kaptAddr || 'N/A'}`);

    // 해당 동의 다른 후보들 조회
    console.log("\n🔎 같은 동의 다른 후보들:");
    const candidates = await executeQuery(`
        SELECT kaptCode, kaptName, kaptdaCnt, kaptAddr
        FROM apt_basic_info
        WHERE kaptAddr LIKE CONCAT('%', ?, '%')
          AND kaptName LIKE CONCAT('%', ?, '%')
        ORDER BY kaptdaCnt DESC
        LIMIT 10
    `, [mapping.umd_nm, mapping.deal_apt_name.substring(0, 2)]);

    if (candidates.length === 0) {
        console.log("  (후보 없음)");
    } else {
        console.log("━".repeat(80));
        console.log(`${"#".padEnd(3)} | ${"kaptCode".padEnd(12)} | ${"이름".padEnd(30)} | 세대수`);
        console.log("━".repeat(80));
        candidates.forEach((c, i) => {
            const isCurrent = c.kaptCode === mapping.kapt_code ? " ← 현재" : "";
            console.log(
                `${String(i + 1).padEnd(3)} | ` +
                `${c.kaptCode.padEnd(12)} | ` +
                `${(c.kaptName || '').substring(0, 30).padEnd(30)} | ` +
                `${c.kaptdaCnt}${isCurrent}`
            );
        });
        console.log("━".repeat(80));
    }

    console.log("\n옵션:");
    console.log("  [번호] - 해당 후보로 변경");
    console.log("  [k:코드] - 직접 kaptCode 입력 (예: k:A12345678)");
    console.log("  [d] - 이 매핑 삭제");
    console.log("  [s] - 건너뛰기");

    const choice = await question("\n선택: ");

    if (choice.toLowerCase() === 's') {
        console.log("건너뜁니다.");
        return;
    }

    if (choice.toLowerCase() === 'd') {
        await executeQuery("DELETE FROM apt_name_mapping WHERE id = ?", [mapping.id]);
        logSuccess(`매핑 삭제됨: ID ${mapping.id}`);
        return;
    }

    if (choice.toLowerCase().startsWith('k:')) {
        const newKaptCode = choice.substring(2).trim();
        await updateMapping(mapping.id, newKaptCode);
        return;
    }

    const idx = parseInt(choice);
    if (!isNaN(idx) && idx >= 1 && idx <= candidates.length) {
        const selected = candidates[idx - 1];
        await updateMapping(mapping.id, selected.kaptCode, selected.kaptName);
        return;
    }

    console.log("올바른 옵션을 입력하세요.");
}

async function updateMapping(id, kaptCode, kaptName = null) {
    // kaptName이 없으면 조회
    if (!kaptName) {
        const info = await executeQuery(
            "SELECT kaptName FROM apt_basic_info WHERE kaptCode = ?",
            [kaptCode]
        );
        kaptName = info.length > 0 ? info[0].kaptName : 'Unknown';
    }

    await executeQuery(`
        UPDATE apt_name_mapping 
        SET kapt_code = ?, basis_apt_name = ?, mapping_type = 'manual', confidence_score = 1.0, updated_at = NOW()
        WHERE id = ?
    `, [kaptCode, kaptName, id]);

    logSuccess(`매핑 업데이트: ID ${id} → ${kaptName} (${kaptCode})`);
}

async function exportToCsv(mappings) {
    const fs = await import('fs');
    const filename = `low_confidence_mappings_${new Date().toISOString().slice(0, 10)}.csv`;

    const header = "ID,실거래명,시군구코드,동,K-apt코드,K-apt명,신뢰도,세대수\n";
    const rows = mappings.map(m =>
        `${m.id},"${m.deal_apt_name}","${m.sgg_cd}","${m.umd_nm}","${m.kapt_code}","${m.basis_apt_name}",${m.confidence_score},${m.kaptdaCnt || ''}`
    ).join("\n");

    fs.writeFileSync(filename, header + rows, 'utf8');
    logSuccess(`CSV 내보내기 완료: ${filename}`);
}

main().catch(console.error);
