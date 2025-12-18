
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError, logSection } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';
const V4_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    logSection("🔍 준공년도 기반 매핑 검증");

    // 1. 낮은 신뢰도 매핑 + 실거래가의 buildYear 조회
    const threshold = 0.8;
    console.log(`\n신뢰도 < ${threshold} 매핑 조회 중...`);

    const lowConfMappings = await executeQuery(`
        SELECT id, deal_apt_name, sgg_cd, umd_nm, kapt_code, basis_apt_name, confidence_score
        FROM apt_name_mapping
        WHERE confidence_score < ?
        ORDER BY id
    `, [threshold]);

    console.log(`총 ${lowConfMappings.length}건 검증 예정\n`);

    // 각 매핑에 대해 buildYear 별도 조회
    for (const m of lowConfMappings) {
        const buildYearResult = await executeQuery(`
            SELECT MAX(buildYear) as buildYear FROM apt_deal_info 
            WHERE aptNm = ? AND umdNm = ? LIMIT 1
        `, [m.deal_apt_name, m.umd_nm]);
        m.buildYear = buildYearResult[0]?.buildYear || null;
    }

    let verified = 0;
    let fixed = 0;
    let noMatch = 0;
    let noBuildYear = 0;

    for (let i = 0; i < lowConfMappings.length; i++) {
        const m = lowConfMappings[i];
        process.stdout.write(`\r검증 중: ${i + 1}/${lowConfMappings.length}`);

        if (!m.buildYear) {
            noBuildYear++;
            continue;
        }

        // 2. 현재 매핑된 kaptCode로 API 호출하여 준공년도 확인
        const currentInfo = await callKaptApi(m.kapt_code);

        if (!currentInfo) {
            noMatch++;
            continue;
        }

        // kaptUsedate: "20100520" → "2010" 추출
        const kaptYear = currentInfo.kaptUsedate ? currentInfo.kaptUsedate.substring(0, 4) : null;
        const dealYear = String(m.buildYear);

        if (kaptYear === dealYear) {
            // 준공년도 일치 → 올바른 매핑!
            await executeQuery(`
                UPDATE apt_name_mapping SET confidence_score = 1.0, updated_at = NOW() WHERE id = ?
            `, [m.id]);
            console.log(`\n✅ [${m.id}] ${m.deal_apt_name}(${m.umd_nm}) → ${m.basis_apt_name} [준공년도 일치: ${dealYear}]`);
            verified++;
        } else {
            // 준공년도 불일치 → 같은 동에서 준공년도 일치하는 후보 찾기
            console.log(`\n⚠️ [${m.id}] ${m.deal_apt_name}(${m.umd_nm}) → ${m.basis_apt_name}`);
            console.log(`   불일치: 실거래=${dealYear}, K-apt=${kaptYear}`);

            // DB에서 같은 동의 후보들 조회
            const candidates = await executeQuery(`
                SELECT kaptCode, kaptName, kaptUsedate FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND kaptName LIKE CONCAT('%', ?, '%')
                ORDER BY kaptdaCnt DESC
                LIMIT 10
            `, [m.umd_nm, m.deal_apt_name]);

            let found = false;
            for (const cand of candidates) {
                if (cand.kaptCode === m.kapt_code) continue;

                const candYear = cand.kaptUsedate ? cand.kaptUsedate.substring(0, 4) : null;
                if (candYear === dealYear) {
                    // 준공년도 일치하는 후보 발견!
                    await executeQuery(`
                        UPDATE apt_name_mapping 
                        SET kapt_code = ?, basis_apt_name = ?, confidence_score = 1.0, mapping_type = 'manual', updated_at = NOW()
                        WHERE id = ?
                    `, [cand.kaptCode, cand.kaptName, m.id]);
                    console.log(`   🔄 수정: ${m.basis_apt_name}(${kaptYear}) → ${cand.kaptName}(${candYear})`);
                    fixed++;
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log(`   ❌ 준공년도 ${dealYear} 일치하는 후보 없음`);
                noMatch++;
            }
        }

        await sleep(100);
    }

    console.log("\n\n" + "=".repeat(50));
    console.log(`결과:`);
    console.log(`  ✅ 검증완료 (준공년도 일치): ${verified}`);
    console.log(`  🔄 수정됨: ${fixed}`);
    console.log(`  ❌ 매칭 실패: ${noMatch}`);
    console.log(`  ⏭️ buildYear 없음: ${noBuildYear}`);
    logSuccess("준공년도 기반 검증 완료!");

    await closeConnection();
}

async function callKaptApi(kaptCode) {
    try {
        const url = `${V4_URL}?serviceKey=${ENCODED_KEY}&kaptCode=${kaptCode}`;
        const res = await axios.get(url, { timeout: 10000 });
        const item = res.data?.response?.body?.item;
        return item || null;
    } catch (e) {
        return null;
    }
}

main().catch(console.error);
