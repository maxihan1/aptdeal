
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { executeQuery, closeConnection } from './utils/db.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SERVICE_KEY = process.env.SERVICE_KEY;
const TARGET_KAPT_CODE = 'A10020533';

async function main() {
    console.log(`Checking K-apt info for code: ${TARGET_KAPT_CODE}`);

    // ServiceKey를 URL에 직접 추가 (인코딩 문제 방지 시도)
    const url = `http://apis.data.go.kr/1613000/AptBasicInfoService/getAptBasicInfo?serviceKey=${SERVICE_KEY}`;

    try {
        console.log("Calling API...");
        const res = await axios.get(url, {
            params: { kaptCode: TARGET_KAPT_CODE }
        });

        console.log("Response Status:", res.status);
        if (res.data) {
            console.log("Data previews:", res.data.substring(0, 200));

            // XML 파싱 (간이)
            const xml = res.data;
            const getTag = (tag) => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] || '';

            const name = getTag('kaptName');
            if (name) {
                console.log(`✅ Found: ${name}`);

                // DB 저장
                await saveToDB(TARGET_KAPT_CODE, xml);
            } else {
                console.log("❌ No kaptName found in response (might be error XML)");
            }
        }
    } catch (e) {
        console.error("API Error:", e.message);
        if (e.response) console.error("Status:", e.response.status);
    }

    // API 실패 시 수동 업데이트
    console.log("\nPerforming manual update with correct code...");
    await manualUpdate(TARGET_KAPT_CODE);

    await closeConnection();
}

async function saveToDB(kaptCode, xml) {
    const getTag = (tag) => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] || '';

    const query = `
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

    await executeQuery(query, [
        kaptCode,
        getTag('kaptName'),
        parseInt(getTag('kaptdaCnt')) || 0,
        parseInt(getTag('kaptDongCnt')) || 0,
        getTag('kaptUsedate'),
        getTag('kaptBcompany'),
        getTag('codeHeatNm'),
        getTag('codeHallNm'),
        getTag('kaptAddr')
    ]);
    console.log("✅ Saved to DB from API");
}

async function manualUpdate(kaptCode) {
    // 이전 임시 데이터 삭제
    await executeQuery("DELETE FROM apt_basic_info WHERE kaptCode = 'A13511401'");
    await executeQuery("DELETE FROM apt_detail_info WHERE kaptCode = 'A13511401'");

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
        kaptCode,
        '판교더샵포레스트11단지',
        448,
        7,
        '20210531',
        '(주)포스코건설',
        '지역난방',
        '계단식',
        '경기도 성남시 분당구 판교대장로5길 58'
    ]);

    const detailQuery = `
        INSERT INTO apt_detail_info
        (kaptCode, kaptdPcnt, kaptdPcntu, kaptdWtimebus, kaptdWtimesub, subwayLine, subwayStation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        kaptdPcnt=VALUES(kaptdPcnt),
        kaptdPcntu=VALUES(kaptdPcntu),
        kaptdWtimebus=VALUES(kaptdWtimebus),
        kaptdWtimesub=VALUES(kaptdWtimesub)
    `;

    await executeQuery(detailQuery, [
        kaptCode,
        '0',
        '605',
        '5분이내',
        '15분이내',
        '',
        ''
    ]);
    console.log("✅ Manual update completed with code", kaptCode);
}

main();
