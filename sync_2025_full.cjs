/**
 * 2025년 전체 데이터 동기화 스크립트
 * 모든 지역의 2025년 1월~12월 데이터를 API에서 가져와 DB에 동기화
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const SERVICE_KEY = process.env.SERVICE_KEY;
const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// 지역 코드 맵 로드
const lawdCdMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'lawd_cd_map.json'), 'utf-8'));
const regions = Object.entries(lawdCdMap).filter(([name, code]) => code.length === 5);

console.log(`
============================================================
  2025년 전체 데이터 동기화
  대상 지역: ${regions.length}개
  대상 기간: 2025년 1월 ~ 12월
============================================================
`);

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllPages(regionCode, dealYmd) {
    const allItems = [];
    let pageNo = 1;

    while (true) {
        const url = `${API_URL}?serviceKey=${encodeURIComponent(SERVICE_KEY)}&LAWD_CD=${regionCode}&DEAL_YMD=${dealYmd}&numOfRows=100&pageNo=${pageNo}`;

        try {
            const response = await axios.get(url, { timeout: 30000 });
            const data = response.data;

            const items = data.response?.body?.items?.item;
            if (!items) break;

            const itemArray = Array.isArray(items) ? items : [items];
            allItems.push(...itemArray);

            if (itemArray.length < 100) break;
            pageNo++;

            if (pageNo > 50) break; // 안전장치

            await delay(100); // Rate limit
        } catch (err) {
            console.error(`  API 에러 (${regionCode}, ${dealYmd}):`, err.message);
            break;
        }
    }

    return allItems;
}

async function main() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectionLimit: 5,
        connectTimeout: 60000
    });

    let totalInserted = 0;
    let totalRegions = 0;

    const startTime = Date.now();

    for (let month = 1; month <= 12; month++) {
        const dealYmd = `2025${String(month).padStart(2, '0')}`;
        console.log(`\n📅 2025년 ${month}월 동기화 중...`);

        let monthInserted = 0;

        for (const [regionName, regionCode] of regions) {
            try {
                const items = await fetchAllPages(regionCode, dealYmd);

                if (items.length === 0) continue;

                // 각 아이템 DB에 UPSERT
                for (const item of items) {
                    const dealAmount = parseInt(String(item.dealAmount || '0').replace(/,/g, '')) || 0;

                    await pool.execute(`
                        INSERT INTO apt_deal_info 
                        (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay, dealAmount, 
                         buildYear, aptDong, jibun, umdNm, buyerGbn, slerGbn, dealingGbn, 
                         estateAgentSggNm, landLeaseholdGbn, cdealDay, cdealType, rgstDate)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                          dealAmount = VALUES(dealAmount),
                          cdealType = VALUES(cdealType),
                          cdealDay = VALUES(cdealDay)
                    `, [
                        regionCode,
                        item.aptNm || '',
                        parseFloat(item.excluUseAr) || 0,
                        parseInt(item.floor) || 0,
                        2025,
                        month,
                        parseInt(item.dealDay) || 0,
                        dealAmount,
                        parseInt(item.buildYear) || 0,
                        item.aptDong || '',
                        item.jibun || '',
                        item.umdNm || '',
                        item.buyerGbn || '',
                        item.slerGbn || '',
                        item.dealingGbn || '',
                        item.estateAgentSggNm || '',
                        item.landLeaseholdGbn || 'N',
                        item.cdealDay || '',
                        item.cdealType || '',
                        item.rgstDate || ''
                    ]);
                }

                monthInserted += items.length;
                totalRegions++;

                // 진행률 표시
                if (totalRegions % 50 === 0) {
                    process.stdout.write(`\r   처리: ${totalRegions}개 지역, ${monthInserted}건 (${month}월)   `);
                }

                await delay(150); // Rate limit 준수

            } catch (err) {
                console.error(`  DB 에러 (${regionName}):`, err.message);
            }
        }

        totalInserted += monthInserted;
        console.log(`\n   ✅ 2025년 ${month}월 완료: ${monthInserted}건 동기화`);
    }

    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

    console.log(`
============================================================
  동기화 완료!
  총 동기화: ${totalInserted.toLocaleString()}건
  소요 시간: ${elapsedMin}분
============================================================
`);

    await pool.end();
}

main().catch(err => {
    console.error('치명적 오류:', err);
    process.exit(1);
});
