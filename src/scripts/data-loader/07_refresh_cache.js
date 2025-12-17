/**
 * 캐시만 갱신하는 스크립트
 */

import { testConnection, closeConnection, executeQuery } from './utils/db.js';
import { log, logError } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

async function refreshCacheOnly() {
    console.log(`
============================================================
  📊 대시보드 캐시 갱신 (캐시만)
  시작 시간: ${new Date().toISOString()}
============================================================
`);

    const connected = await testConnection();
    if (!connected) {
        console.log('❌ DB 연결 실패');
        process.exit(1);
    }

    try {
        // 캐시 테이블 생성 (없으면)
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS dashboard_stats_cache (
                id INT AUTO_INCREMENT PRIMARY KEY,
                region_code VARCHAR(50) NOT NULL,
                stat_type VARCHAR(50) NOT NULL,
                stat_value JSON NOT NULL,
                latest_deal_date VARCHAR(10),
                calculated_at DATETIME NOT NULL,
                UNIQUE KEY uk_region_stat (region_code, stat_type),
                INDEX idx_calculated_at (calculated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // 시도 목록 조회 (수정된 방식 - 구조분해 제거)
        const sidoRows = await executeQuery(`
            SELECT DISTINCT as1 FROM apt_list WHERE as1 IS NOT NULL AND as1 != '' ORDER BY as1
        `);
        const sidoList = ['ALL', ...sidoRows.map(r => r.as1)];

        // 전국 최신 거래일 조회 (수정된 방식)
        const globalLatestRows = await executeQuery(`
            SELECT dealYear, dealMonth, dealDay
            FROM apt_deal_info
            ORDER BY dealYear DESC, dealMonth DESC, dealDay DESC
            LIMIT 1
        `);

        let globalLatestDate = null;
        if (globalLatestRows[0]) {
            const { dealYear, dealMonth, dealDay } = globalLatestRows[0];
            globalLatestDate = { dealYear, dealMonth, dealDay };
            console.log(`✅ 전국 최신 거래일: ${dealYear}-${String(dealMonth).padStart(2, '0')}-${String(dealDay).padStart(2, '0')}`);
        }

        console.log(`📋 캐시 갱신 대상: ${sidoList.length}개 지역\n`);

        for (const sido of sidoList) {
            await updateCacheForRegion(sido, globalLatestDate);
        }

        console.log(`
============================================================
  ✅ 캐시 갱신 완료!
  종료 시간: ${new Date().toISOString()}
============================================================
`);

    } catch (error) {
        console.error(`❌ 캐시 갱신 오류: ${error.message}`);
    }

    await closeConnection();
}

async function updateCacheForRegion(sido, globalLatestDate) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const regionJoin = sido !== 'ALL' ? `
        JOIN (
            SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 
            FROM apt_list WHERE as1 = ?
        ) l ON d.sggCd = l.sggCode
    ` : '';

    const regionParams = sido !== 'ALL' ? [sido] : [];

    try {
        // 1. 최고 거래 지역
        const topRegionQuery = sido !== 'ALL'
            ? `SELECT CONCAT(l.as1, ' ', l.as2) as region, COUNT(*) as count
               FROM apt_deal_info d ${regionJoin}
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY l.as1, l.as2 ORDER BY count DESC LIMIT 1`
            : `SELECT CONCAT(l.as1, ' ', l.as2) as region, COUNT(*) as count
               FROM apt_deal_info d
               JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 FROM apt_list) l ON d.sggCd = l.sggCode
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY l.as1, l.as2 ORDER BY count DESC LIMIT 1`;

        const topRegionRows = await executeQuery(topRegionQuery, regionParams);
        const topRegion = topRegionRows[0] || { region: "데이터 없음", count: 0 };

        // 2. 월간 거래량
        const monthlyQuery = `SELECT COUNT(*) as count FROM apt_deal_info d ${sido !== 'ALL' ? regionJoin : ''}
                              WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
        const monthlyRows = await executeQuery(monthlyQuery, regionParams);

        // 3. 일일 거래량
        let todayVolume = 0;
        let latestDateStr = null;

        if (globalLatestDate) {
            const { dealYear, dealMonth, dealDay } = globalLatestDate;
            latestDateStr = `${dealYear}-${String(dealMonth).padStart(2, '0')}-${String(dealDay).padStart(2, '0')}`;

            const dailyQuery = `SELECT COUNT(*) as count FROM apt_deal_info d ${sido !== 'ALL' ? regionJoin : ''}
                               WHERE d.dealYear = ? AND d.dealMonth = ? AND d.dealDay = ?`;
            const dailyParams = sido !== 'ALL' ? [...regionParams, dealYear, dealMonth, dealDay] : [dealYear, dealMonth, dealDay];
            const dailyRows = await executeQuery(dailyQuery, dailyParams);
            todayVolume = dailyRows[0]?.count || 0;
        }

        // 4. 거래 취소 건수
        const cancelledQuery = `SELECT COUNT(*) as count FROM apt_deal_info d ${sido !== 'ALL' ? regionJoin : ''}
                               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                               AND cdealType IS NOT NULL AND cdealType != ''`;
        const cancelledRows = await executeQuery(cancelledQuery, regionParams);

        // 5. 가격 추이 (30일)
        const trendQuery = sido !== 'ALL'
            ? `SELECT DATE_FORMAT(d.dealDate, '%m-%d') as date, ROUND(AVG(d.dealAmount)) as average, COUNT(*) as count
               FROM apt_deal_info d ${regionJoin}
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY date ORDER BY date ASC`
            : `SELECT DATE_FORMAT(d.dealDate, '%m-%d') as date, ROUND(AVG(d.dealAmount)) as average, COUNT(*) as count
               FROM apt_deal_info d
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY date ORDER BY date ASC`;
        const trendRows = await executeQuery(trendQuery, regionParams);

        // 6. 인기 단지 (30일)
        const popularQuery = sido !== 'ALL'
            ? `SELECT d.aptNm, CONCAT(l.as1, ' ', l.as2, ' ', IFNULL(d.umdNm, '')) as region,
                      l.as1 as sido, l.as2 as sigungu, d.umdNm as dong, COUNT(*) as count 
               FROM apt_deal_info d ${regionJoin}
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY d.aptNm, region, l.as1, l.as2, d.umdNm
               ORDER BY count DESC LIMIT 5`
            : `SELECT d.aptNm, CONCAT(l.as1, ' ', l.as2, ' ', IFNULL(d.umdNm, '')) as region,
                      l.as1 as sido, l.as2 as sigungu, d.umdNm as dong, COUNT(*) as count 
               FROM apt_deal_info d
               JOIN (SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 FROM apt_list) l ON d.sggCd = l.sggCode
               WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               GROUP BY d.aptNm, region, l.as1, l.as2, d.umdNm
               ORDER BY count DESC LIMIT 5`;
        const popularComplexRows = await executeQuery(popularQuery, regionParams);

        // 캐시 저장
        const cacheData = {
            topRegion,
            monthlyVolume: monthlyRows[0]?.count || 0,
            todayVolume,
            latestDate: latestDateStr,
            cancelledCount: cancelledRows[0]?.count || 0,
            trend: trendRows,
            popularComplexes: popularComplexRows
        };

        await executeQuery(`
            INSERT INTO dashboard_stats_cache (region_code, stat_type, stat_value, latest_deal_date, calculated_at)
            VALUES (?, 'dashboard', ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                stat_value = VALUES(stat_value),
                latest_deal_date = VALUES(latest_deal_date),
                calculated_at = VALUES(calculated_at)
        `, [sido, JSON.stringify(cacheData), latestDateStr, now]);

        log(`[캐시] ${sido}: 월간 ${cacheData.monthlyVolume}건, 일일 ${cacheData.todayVolume}건 (${latestDateStr})`);

    } catch (error) {
        logError(`[캐시] ${sido} 오류: ${error.message}`);
    }
}

refreshCacheOnly();
