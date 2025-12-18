
import dotenv from 'dotenv';
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';
import path from 'path';

// .env 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SERVICE_KEY = process.env.SERVICE_KEY;

// API 호출 지연 시간 (밀리초) - 트래픽 제어
const DELAY_MS = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const targetRegion = process.argv[2] || '경기도 성남분당구'; // 실행 인자로 지역 받기
    logSection(`🚀 K-apt Data Sync for: ${targetRegion}`);

    if (!SERVICE_KEY) {
        logError("❌ SERVICE_KEY가 설정되지 않았습니다.");
        return;
    }

    // 1. 대상 지역의 법정동 코드 조회 (apt_list 활용)
    const [sido, sigungu] = targetRegion.split(' ');

    // bjdCode 10자리 확인 (K-apt API용)
    const regionQuery = `
        SELECT DISTINCT bjdCode, as3 as dong 
        FROM apt_list 
        WHERE as1 = ? AND as2 = ?
        AND bjdCode IS NOT NULL
        ORDER BY bjdCode
    `;

    const regions = await executeQuery(regionQuery, [sido, sigungu]);

    if (regions.length === 0) {
        logError(`No regions found for ${sido} ${sigungu}`);
        return;
    }

    console.log(`Found ${regions.length} dongs in ${targetRegion}`);

    let totalComplexes = 0;
    let updatedCount = 0;

    for (const region of regions) {
        // 법정동 코드는 10자리여야 함
        const bjdCode = region.bjdCode;
        console.log(`\n📍 Processing ${region.dong} (${bjdCode})...`);

        try {
            // 2. K-apt 단지 목록 조회
            const complexes = await fetchComplexList(bjdCode);
            console.log(`   Found ${complexes.length} complexes.`);

            totalComplexes += complexes.length;

            for (const complex of complexes) {
                // 3. 단지 상세 정보 조회 및 저장
                const success = await fetchAndSaveBasicInfo(complex.kaptCode, complex.kaptName);
                if (success) updatedCount++;
                await sleep(DELAY_MS);
            }

        } catch (e) {
            logError(`Failed to process ${region.dong}: ${e.message}`);
        }
    }

    logSuccess(`\n✅ Sync Completed! Total: ${totalComplexes}, Updated: ${updatedCount}`);
    await closeConnection();
}

async function fetchComplexList(bjdCode) {
    // ServiceKey를 URL에 직접 추가 (인코딩 문제 방지)
    const url = `http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList?serviceKey=${SERVICE_KEY}`;

    try {
        const res = await axios.get(url, {
            params: {
                bjdCode: bjdCode,
                numOfRows: 1000, // 한 번에 많이
                pageNo: 1
            }
        });

        // XML 파싱 (간이)
        const items = [];
        const itemMatches = res.data.matchAll(/<item>(.*?)<\/item>/gs);

        for (const match of itemMatches) {
            const content = match[1];
            const kaptCode = content.match(/<kaptCode>(.*?)<\/kaptCode>/)?.[1];
            const kaptName = content.match(/<kaptName>(.*?)<\/kaptName>/)?.[1];

            if (kaptCode && kaptName) {
                items.push({ kaptCode, kaptName });
            }
        }
        return items;

    } catch (e) {
        // 에러 로깅하되 빈 배열 반환하여 계속 진행
        console.warn(`   ⚠️ List API Error: ${e.message}`);
        return [];
    }
}

async function fetchAndSaveBasicInfo(kaptCode, kaptName) {
    const url = `http://apis.data.go.kr/1613000/AptBasicInfoService/getAptBasicInfo?serviceKey=${SERVICE_KEY}`;

    try {
        const res = await axios.get(url, {
            params: { kaptCode: kaptCode }
        });

        const xml = res.data;
        const getTag = (tag) => xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`))?.[1] || '';

        // 필수 데이터 확인
        const name = getTag('kaptName');
        if (!name) return false;

        // DB Upsert
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
            name,
            parseInt(getTag('kaptdaCnt')) || 0,
            parseInt(getTag('kaptDongCnt')) || 0,
            getTag('kaptUsedate'),
            getTag('kaptBcompany'),
            getTag('codeHeatNm'),
            getTag('codeHallNm'),
            getTag('kaptAddr')
        ]);

        process.stdout.write('.'); // 진행 상황 표시
        return true;

    } catch (e) {
        console.warn(`\n   ⚠️ Detail API Error for ${kaptName}: ${e.message}`);
        return false;
    }
}

main().catch(console.error);
