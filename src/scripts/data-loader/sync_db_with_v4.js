
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { log, logError, logSuccess, logSection } from './utils/logger.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// 사용자가 제공한 인코딩된 키 (확실히 작동함)
const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';

// V4 API URL
const V4_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4';

// 배치 처리 설정
const BATCH_SIZE = 10; // 한번에 처리할 아파트 수
const DELAY_MS = 100; // 배치 간 딜레이

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    logSection("🚀 Starting Full Data Sync with AptBasisInfoServiceV4");

    // 1. apt_list에서 kaptCode 목록 가져오기
    console.log("Fetching kaptCode list from DB...");
    const codes = await executeQuery("SELECT kaptCode, kaptName FROM apt_list");

    if (codes.length === 0) {
        logError("No data in apt_list table.");
        return;
    }

    console.log(`📋 Total complexes to sync: ${codes.length}`);

    let processed = 0;
    let updated = 0;
    let failed = 0;

    // 배치 처리
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const batch = codes.slice(i, i + BATCH_SIZE);
        const promises = batch.map(item => syncComplex(item.kaptCode, item.kaptName));

        const results = await Promise.all(promises);

        updated += results.filter(r => r).length;
        failed += results.filter(r => !r).length;
        processed += batch.length;

        process.stdout.write(`\rProgress: ${processed}/${codes.length} (Updated: ${updated}, Failed: ${failed})`);

        await sleep(DELAY_MS);
    }

    logSuccess(`\n✅ Sync Completed! Updated: ${updated}, Failed: ${failed}`);
    await closeConnection();
}

async function syncComplex(kaptCode, kaptName) {
    const url = `${V4_URL}?serviceKey=${ENCODED_KEY}&kaptCode=${kaptCode}`;

    try {
        const res = await axios.get(url, { timeout: 10000 });
        let data = res.data;

        // JSON 파싱 (공공데이터가 JSON을 리턴할 수도 XML을 리턴할 수도 있음)
        // V4는 JSON 리턴 가능성이 높음 (테스트 결과 obj였음)
        // 하지만 실패 시 XML 에러가 올 수도 있음

        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                // XML일 수 있음 -> 간단히 파싱 시도 (Regex)
                // 하지만 V4 테스트 결과는 JSON 객체였음
                // XML 파싱 로직 추가 (에러 메시지 등)
            }
        }

        const item = data?.response?.body?.item;

        if (!item) {
            // 데이터 없음
            return false;
        }

        // DB 저장
        // V4 응답 필드 매핑
        // kaptCode, kaptName, kaptdaCnt(세대수), kaptDongCnt(동수), kaptUsedate(사용승인), 
        // kaptBcompany(시공사), codeHeatNm(난방), codeHallNm(복도), kaptAddr(주소),
        // kaptTarea(연면적), hoCnt(호수), kaptMarea(주거전용면적) 등등

        const basicQuery = `
            INSERT INTO apt_basic_info 
            (kaptCode, kaptName, kaptdaCnt, kaptDongCnt, kaptUsedate, kaptBcompany, codeHeatNm, codeHallNm, kaptAddr)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            kaptName=VALUES(kaptName),
            kaptdaCnt=VALUES(kaptdaCnt),
            kaptDongCnt=VALUES(kaptDongCnt),
            kaptUsedate=VALUES(kaptUsedate),
            kaptBcompany=VALUES(kaptBcompany),
            codeHeatNm=VALUES(codeHeatNm),
            codeHallNm=VALUES(codeHallNm),
            kaptAddr=VALUES(kaptAddr)
        `;

        await executeQuery(basicQuery, [
            item.kaptCode,
            item.kaptName,
            parseInt(item.kaptdaCnt) || 0,
            parseInt(item.kaptDongCnt) || 0,
            item.kaptUsedate,
            item.kaptBcompany,
            item.codeHeatNm,
            item.codeHallNm,
            item.kaptAddr || item.doroJuso // kaptAddr가 없으면 도로명주소 사용
        ]);

        // 상세 정보 (주차 등) 저장이 필요하다면?
        // V4 결과에는 주차 관련 필드가 있는지 확인 필요. (테스트 결과에는 안보였지만 있을 수 있음)
        // 일단 기본 정보만 저장

        return true;

    } catch (e) {
        // console.warn(`Failed for ${kaptName} (${kaptCode}): ${e.message}`);
        return false;
    }
}

main().catch(console.error);
