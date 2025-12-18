
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
    logSection("🔍 API 검증으로 낮은 신뢰도 매핑 수정");

    // 1. 낮은 신뢰도 매핑 조회
    const threshold = 0.8;
    console.log(`\n신뢰도 < ${threshold} 매핑 조회 중...`);

    const lowConfMappings = await executeQuery(`
        SELECT m.id, m.deal_apt_name, m.sgg_cd, m.umd_nm, m.kapt_code, m.basis_apt_name, m.confidence_score
        FROM apt_name_mapping m
        WHERE m.confidence_score < ?
        ORDER BY m.id
    `, [threshold]);

    console.log(`총 ${lowConfMappings.length}건 검증 예정\n`);

    let verified = 0;
    let fixed = 0;
    let failed = 0;

    for (const m of lowConfMappings) {
        process.stdout.write(`\r검증 중: ${verified + fixed + failed + 1}/${lowConfMappings.length}`);

        // 2. 현재 매핑된 kaptCode로 API 호출하여 주소 확인
        const currentInfo = await callKaptApi(m.kapt_code);

        if (!currentInfo) {
            failed++;
            continue;
        }

        // 3. 주소에 동(umdNm)이 포함되어 있는지 확인
        const umdNm = m.umd_nm.replace(/\s+/g, '');
        const currentAddr = (currentInfo.kaptAddr || '').replace(/\s+/g, '');

        if (currentAddr.includes(umdNm)) {
            // 현재 매핑이 맞음 → 신뢰도만 올림
            await executeQuery(`
                UPDATE apt_name_mapping SET confidence_score = 1.0, updated_at = NOW() WHERE id = ?
            `, [m.id]);
            verified++;
            console.log(`\n✅ [${m.id}] ${m.deal_apt_name}(${m.umd_nm}) → ${m.basis_apt_name} [주소 일치 확인됨]`);
        } else {
            // 주소 불일치 → 같은 동의 다른 후보들 API로 확인
            console.log(`\n⚠️ [${m.id}] ${m.deal_apt_name}(${m.umd_nm}) → ${m.basis_apt_name} [주소 불일치: ${currentInfo.kaptAddr}]`);

            // DB에서 같은 동의 후보들 조회
            const candidates = await executeQuery(`
                SELECT kaptCode, kaptName FROM apt_basic_info
                WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                  AND kaptName LIKE CONCAT('%', ?, '%')
                ORDER BY kaptdaCnt DESC
                LIMIT 5
            `, [m.umd_nm, m.deal_apt_name]);

            let found = false;
            for (const cand of candidates) {
                if (cand.kaptCode === m.kapt_code) continue; // 현재 것은 스킵

                const candInfo = await callKaptApi(cand.kaptCode);
                if (candInfo && (candInfo.kaptAddr || '').includes(m.umd_nm)) {
                    // 이 후보가 맞음!
                    await executeQuery(`
                        UPDATE apt_name_mapping 
                        SET kapt_code = ?, basis_apt_name = ?, confidence_score = 1.0, mapping_type = 'manual', updated_at = NOW()
                        WHERE id = ?
                    `, [cand.kaptCode, candInfo.kaptName, m.id]);
                    console.log(`   🔄 수정: ${m.basis_apt_name} → ${candInfo.kaptName} (${candInfo.kaptAddr})`);
                    fixed++;
                    found = true;
                    break;
                }
                await sleep(100); // API 호출 간격
            }

            if (!found) {
                console.log(`   ❌ 적합한 후보 없음`);
                failed++;
            }
        }

        await sleep(100); // API 호출 간격
    }

    console.log("\n\n" + "=".repeat(50));
    console.log(`결과: 검증완료 ${verified}, 수정됨 ${fixed}, 실패 ${failed}`);
    logSuccess("API 검증 완료!");

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
