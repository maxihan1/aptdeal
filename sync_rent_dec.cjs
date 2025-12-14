/**
 * 2025년 12월 전월세 재동기화 스크립트
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

console.log(`
============================================================
  2025년 12월 전월세 재동기화
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
            await delay(100);
        } catch (err) {
            console.error(`  API 에러 (${regionCode}):`, err.message);
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
        connectionLimit: 3,
        connectTimeout: 60000
    });

    let totalInserted = 0;
    const dealYmd = '202512';

    for (const [regionName, regionCode] of regions) {
        try {
            const items = await fetchAllPages(regionCode, dealYmd);
            if (items.length === 0) continue;

            for (const item of items) {
                const deposit = parseInt(String(item.deposit || item.preDeposit || '0').replace(/,/g, '')) || 0;
                const monthlyRent = parseInt(String(item.monthlyRent || '0').replace(/,/g, '')) || 0;

                await pool.execute(`
                    INSERT INTO apt_rent_info 
                    (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay,
                     deposit, preDeposit, monthlyRent, buildYear, aptDong, jibun, umdNm,
                     contractType, contractTerm, preMonthlyRent, useRRRight)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      deposit = VALUES(deposit),
                      preDeposit = VALUES(preDeposit),
                      monthlyRent = VALUES(monthlyRent)
                `, [
                    regionCode,
                    item.aptNm || '',
                    parseFloat(item.excluUseAr) || 0,
                    parseInt(item.floor) || 0,
                    2025,
                    12,
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
                ]);
            }

            totalInserted += items.length;
            if (totalInserted % 1000 === 0) {
                console.log(`진행: ${totalInserted}건 동기화`);
            }

            await delay(200);
        } catch (err) {
            console.error(`DB 에러 (${regionName}):`, err.message);
        }
    }

    console.log(`
============================================================
  12월 재동기화 완료!
  총 동기화: ${totalInserted.toLocaleString()}건
============================================================
`);

    await pool.end();
}

main().catch(console.error);
