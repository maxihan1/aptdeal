/**
 * apt_basic_info에서 kaptUsedate가 없는 아파트에 대해 K-apt API 호출하여 업데이트
 * 
 * 실행: node src/scripts/data-loader/update_kapt_usedate.js
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';
import path from 'path';

// .env 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SERVICE_KEY = process.env.SERVICE_KEY;
const DELAY_MS = 100;
const BATCH_SIZE = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    logSection('🏗️ K-apt kaptUsedate 업데이트');

    if (!SERVICE_KEY) {
        logError("❌ SERVICE_KEY가 설정되지 않았습니다.");
        return;
    }

    // kaptUsedate가 없거나 빈 값인 아파트 조회
    const query = `
        SELECT kaptCode, kaptName 
        FROM apt_basic_info 
        WHERE kaptUsedate IS NULL OR kaptUsedate = ''
        ORDER BY kaptdaCnt DESC
    `;

    const apartments = await executeQuery(query);
    console.log(`📊 업데이트 대상: ${apartments.length}개 아파트`);

    if (apartments.length === 0) {
        logSuccess('✅ 모든 아파트에 kaptUsedate가 있습니다.');
        await closeConnection();
        return;
    }

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < apartments.length; i++) {
        const apt = apartments[i];

        try {
            const url = `http://apis.data.go.kr/1613000/AptBasicInfoService/getAptBasicInfo?serviceKey=${SERVICE_KEY}`;
            const res = await axios.get(url, {
                params: { kaptCode: apt.kaptCode },
                timeout: 10000
            });

            const xml = res.data;
            const kaptUsedate = xml.match(/<kaptUsedate>(.*?)<\/kaptUsedate>/)?.[1] || '';

            if (kaptUsedate) {
                await executeQuery(
                    `UPDATE apt_basic_info SET kaptUsedate = ? WHERE kaptCode = ?`,
                    [kaptUsedate, apt.kaptCode]
                );
                updated++;
                process.stdout.write('.');
            } else {
                process.stdout.write('x');
            }

        } catch (e) {
            failed++;
            process.stdout.write('!');
        }

        await sleep(DELAY_MS);

        // 진행 상황 출력
        if ((i + 1) % BATCH_SIZE === 0) {
            console.log(`\n   ${i + 1}/${apartments.length} 처리 완료 (업데이트: ${updated}, 실패: ${failed})`);
        }
    }

    console.log('\n');
    logSuccess(`✅ 완료! 업데이트: ${updated}개, 실패: ${failed}개`);
    await closeConnection();
}

main().catch(console.error);
