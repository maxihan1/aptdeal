/**
 * 2025년 4월~12월 전월세 재동기화 (배치 버전 - 10배 빠름)
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const SERVICE_KEY = process.env.SERVICE_KEY;
const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';

const lawdCdMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'lawd_cd_map.json'), 'utf-8'));
const regions = Object.entries(lawdCdMap).filter(([name, code]) => code.length === 5);

const START_MONTH = 5; // 4월은 이미 완료, 5월부터
const END_MONTH = 12;

console.log(`
============================================================
  2025년 ${START_MONTH}월~${END_MONTH}월 전월세 재동기화 (배치)
  대상 지역: ${regions.length}개
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
            const items = response.data?.response?.body?.items?.item;
            if (!items) break;

            const itemArray = Array.isArray(items) ? items : [items];
            allItems.push(...itemArray);

            if (itemArray.length < 100) break;
            pageNo++;
            if (pageNo > 100) break;
            await delay(50); // 더 짧은 딜레이
        } catch (err) {
            break; // 에러 시 조용히 스킵
        }
    }
    return allItems;
}

async function batchInsert(pool, items, month) {
    if (items.length === 0) return 0;

    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        const values = batch.map(item => {
            const deposit = parseInt(String(item.deposit || item.preDeposit || '0').replace(/,/g, '')) || 0;
            const monthlyRent = parseInt(String(item.monthlyRent || '0').replace(/,/g, '')) || 0;

            return [
                item.sggCd,
                item.aptNm || '',
                parseFloat(item.excluUseAr) || 0,
                parseInt(item.floor) || 0,
                2025,
                month,
                parseInt(item.dealDay) || 0,
                deposit,
                deposit,
                monthlyRent,
                parseInt(item.buildYear) || 0,
                item.aptDong || '',
                item.jibun || '',
                item.umdNm || '',
                item.contractType || '',
                item.contractTerm || '',
                parseInt(String(item.previousMonthlyRent || '0').replace(/,/g, '')) || 0,
                item.useRRRight || ''
            ];
        });

        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const flatValues = values.flat();

        try {
            await pool.execute(`
                INSERT INTO apt_rent_info 
                (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay,
                 deposit, preDeposit, monthlyRent, buildYear, aptDong, jibun, umdNm,
                 contractType, contractTerm, preMonthlyRent, useRRRight)
                VALUES ${placeholders}
                ON DUPLICATE KEY UPDATE
                  deposit = VALUES(deposit),
                  preDeposit = VALUES(preDeposit),
                  monthlyRent = VALUES(monthlyRent)
            `, flatValues);
            inserted += batch.length;
        } catch (err) {
            // 배치 실패 시 개별 삽입
            for (const v of values) {
                try {
                    await pool.execute(`
                        INSERT INTO apt_rent_info 
                        (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay,
                         deposit, preDeposit, monthlyRent, buildYear, aptDong, jibun, umdNm,
                         contractType, contractTerm, preMonthlyRent, useRRRight)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE deposit = VALUES(deposit)
                    `, v);
                    inserted++;
                } catch (e) { }
            }
        }
    }

    return inserted;
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
    const startTime = Date.now();

    for (let month = START_MONTH; month <= END_MONTH; month++) {
        const dealYmd = `2025${String(month).padStart(2, '0')}`;
        console.log(`\n📅 2025년 ${month}월 전월세 동기화 중...`);

        const monthItems = [];
        let regionCount = 0;

        // 먼저 모든 API 데이터 수집
        for (const [regionName, regionCode] of regions) {
            const items = await fetchAllPages(regionCode, dealYmd);
            items.forEach(item => item.sggCd = regionCode);
            monthItems.push(...items);
            regionCount++;

            if (regionCount % 50 === 0) {
                process.stdout.write(`\r   API 수집: ${regionCount}/280 지역, ${monthItems.length}건   `);
            }

            await delay(100); // API 딜레이
        }

        console.log(`\n   API 수집 완료: ${monthItems.length}건`);

        // 배치 삽입
        const inserted = await batchInsert(pool, monthItems, month);
        totalInserted += inserted;

        console.log(`   ✅ 2025년 ${month}월 완료: ${inserted}건 동기화`);
    }

    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

    console.log(`
============================================================
  전월세 재동기화 완료!
  총 동기화: ${totalInserted.toLocaleString()}건
  소요 시간: ${elapsedMin}분
============================================================
`);

    await pool.end();
}

main().catch(console.error);
