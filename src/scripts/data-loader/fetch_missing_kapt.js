
import dotenv from 'dotenv';
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import { log, logError, logSuccess } from './utils/logger.js';
import path from 'path';

// .env 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SERVICE_KEY = process.env.SERVICE_KEY;
// SERVICE_KEY가 인코딩된 상태일 수 있으므로 디코딩 처리 필요할 수 있음
// 보통 axios는 인코딩된 키를 그대로 보내야 함 (서비스에 따라 다름)
// 여기서는 .env 값을 그대로 사용

async function main() {
    console.log("🔍 Starting K-apt Data Recovery for '대장동'...");

    // 1. 대장동 법정동 코드 찾기
    // DB: 4113511600 -> API Error
    // Try: 4113511400 (Commonly used code)
    const bjdCode = '4113511400';
    console.log(`📍 Using Manual BjdCode: ${bjdCode}`);

    // 2. K-apt 단지 목록 조회 API 호출
    try {
        // ServiceKey를 URL에 직접 추가 (Axios 인코딩 방지)
        const listUrl = `http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList?serviceKey=${SERVICE_KEY}`;
        const listParams = {
            bjdCode: bjdCode,
            numOfRows: 100,
            pageNo: 1
        };

        console.log(`🌐 Calling AptListService2...`);
        const listRes = await axios.get(listUrl, { params: listParams });

        // 응답 구조 확인 (XML 또는 JSON)
        // 보통 공공데이터는 XML이 기본이지만 JSON 요청 가능할 수도 있음. 
        // 여기서는 XML을 가정하고 간단히 정규식으로 파싱하거나 JSON옵션 시도 안함(기본 XML)

        // XML 파싱 (간이)
        const items = [];
        const itemMatches = listRes.data.matchAll(/<item>(.*?)<\/item>/gs);

        for (const match of itemMatches) {
            const content = match[1];
            const kaptCode = content.match(/<kaptCode>(.*?)<\/kaptCode>/)?.[1];
            const kaptName = content.match(/<kaptName>(.*?)<\/kaptName>/)?.[1];

            if (kaptCode && kaptName) {
                items.push({ kaptCode, kaptName });
            }
        }

        console.log(`📋 Found ${items.length} complexes in 대장동.`);

        // "더샵"이나 "포레스트" 포함된 단지 필터링
        const targets = items.filter(item => item.kaptName.includes('더샵') || item.kaptName.includes('포레스트'));

        console.log(`🎯 Targets found:`, targets);

        for (const target of targets) {
            await fetchAndSaveBasicInfo(target.kaptCode, target.kaptName);
        }

    } catch (error) {
        logError("API Call Failed", error.message);
        if (error.response) console.log(error.response.data);
    }

    await closeConnection();
}

async function fetchAndSaveBasicInfo(kaptCode, kaptName) {
    console.log(`\n📥 Fetching basic info for ${kaptName} (${kaptCode})...`);

    const url = `http://apis.data.go.kr/1613000/AptBasicInfoService/getAptBasicInfo?serviceKey=${SERVICE_KEY}`;
    const params = {
        kaptCode: kaptCode
    };

    try {
        const res = await axios.get(url, { params });
        const xml = res.data;

        // Helper to extract tag content
        const getTag = (tag) => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] || '';

        const data = {
            kaptCode: kaptCode,
            kaptName: getTag('kaptName'),
            kaptdaCnt: parseInt(getTag('kaptdaCnt')) || 0,
            kaptDongCnt: parseInt(getTag('kaptDongCnt')) || 0,
            kaptUsedate: getTag('kaptUsedate'), // YYYYMMDD
            kaptBcompany: getTag('kaptBcompany'), // 시공사
            codeHeatNm: getTag('codeHeatNm'),
            codeHallNm: getTag('codeHallNm'),
            kaptAddr: getTag('kaptAddr'), // 주소
            // 필요한 필드 추가
        };

        if (!data.kaptName) {
            console.log("❌ 데이터 없음 또는 파싱 실패");
            return;
        }

        console.log(`✅ Extracted:`, data);

        // kaptdPcnt, kaptdPcntu, kaptdEcntp 등 주차 정보는 getAptBasicInfo에 없을 수 있음
        // (별도 API: AptDetailInfoService 필요할 수 있음. 일단 Basic Info에 있는 것만이라도)

        // DB Upsert
        // apt_basic_info 테이블 구조에 맞춰 INSERT
        // 기본 정보 테이블 컬럼 확인 필요:
        // kaptCode, kaptName, kaptdaCnt, kaptDongCnt, kaptUsedate, kaptBcompany, codeHeatNm, codeHallNm, kaptAddr 등

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
            data.kaptCode,
            data.kaptName,
            data.kaptdaCnt,
            data.kaptDongCnt,
            data.kaptUsedate,
            data.kaptBcompany,
            data.codeHeatNm,
            data.codeHallNm,
            data.kaptAddr
        ]);

        console.log(`💾 Saved to DB: ${data.kaptName}`);

    } catch (e) {
        console.error(`Error processing ${kaptName}:`, e.message);
    }
}

main().catch(console.error);
