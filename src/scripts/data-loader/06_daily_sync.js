/**
 * 일일/주간 자동 동기화 스크립트
 * 
 * 사용법:
 *   node 06_daily_sync.js --mode=daily   # 최근 3개월 (매일 실행)
 *   node 06_daily_sync.js --mode=weekly  # 최근 6개월 (매주 월요일 실행)
 * 
 * 크론탭 예시:
 *   # 매일 새벽 4시
 *   0 4 * * * cd /path/to/web && node src/scripts/data-loader/06_daily_sync.js --mode=daily >> sync.log 2>&1
 *   # 매주 월요일 새벽 3시
 *   0 3 * * 1 cd /path/to/web && node src/scripts/data-loader/06_daily_sync.js --mode=weekly >> sync.log 2>&1
 */

import { testConnection, closeConnection, executeQuery } from './utils/db.js';
import { fetchAptDeals, fetchAptRents, getAPITotalCount, API_CONFIG } from './utils/api.js';
import { log, logError, logWarning } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_KEY = process.env.SERVICE_KEY;

// 커맨드라인 인수 파싱
const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'daily';

// 모드별 설정
const MONTHS_TO_CHECK = mode === 'weekly' ? 6 : 3;

console.log(`
============================================================
  ${mode === 'weekly' ? '📅 주간' : '🔄 일일'} 데이터 동기화
  검증 기간: 최근 ${MONTHS_TO_CHECK}개월
  시작 시간: ${new Date().toISOString()}
============================================================
`);

// 지역 코드 로드
const regionsPath = path.join(__dirname, '..', '..', '..', 'lawd_cd_map.json');
let REGIONS = {};
try {
    REGIONS = JSON.parse(fs.readFileSync(regionsPath, 'utf-8'));
    log(`지역 코드 로드 완료: ${Object.keys(REGIONS).length}개`);
} catch (error) {
    logError(`지역 코드 파일 로드 실패: ${error.message}`);
    process.exit(1);
}

/**
 * 검증 대상 년월 목록 생성
 */
function getTargetMonths(monthsBack) {
    const months = [];
    const now = new Date();

    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            year: d.getFullYear(),
            month: d.getMonth() + 1
        });
    }

    return months;
}

/**
 * 단일 지역-월 검증 및 복구
 */
async function verifyAndRecoverRegionMonth(regionName, regionCode, year, month, type) {
    const dealYmd = `${year}${String(month).padStart(2, '0')}`;
    const tableName = type === 'deal' ? 'apt_deal_info' : 'apt_rent_info';
    const apiUrl = type === 'deal' ? API_CONFIG.DEAL_URL : API_CONFIG.RENT_URL;

    try {
        // API 건수 조회
        const apiCount = await getAPITotalCount(apiUrl, regionCode, dealYmd, SERVICE_KEY);

        // DB 건수 조회
        const [result] = await executeQuery(`
      SELECT COUNT(*) as cnt FROM ${tableName} 
      WHERE sggCd = ? AND dealYear = ? AND dealMonth = ?
    `, [regionCode, year, month]);
        const dbCount = result?.cnt || 0;

        const diff = apiCount - dbCount;

        // 불일치 시 복구
        if (diff > 0) {
            logWarning(`[${type}] ${regionName} ${year}-${month}: API(${apiCount}) > DB(${dbCount}), 차이 ${diff}건 → 복구 시작`);

            // API에서 전체 데이터 가져오기
            const items = type === 'deal'
                ? await fetchAptDeals(regionCode, dealYmd, SERVICE_KEY)
                : await fetchAptRents(regionCode, dealYmd, SERVICE_KEY);

            if (items && items.length > 0) {
                // 데이터 변환 및 삽입
                const insertedCount = await insertData(items, type, regionCode, year, month);
                log(`[${type}] ${regionName} ${year}-${month}: ${insertedCount}건 복구 완료`);
                return { synced: insertedCount, diff };
            }
        }

        return { synced: 0, diff };
    } catch (error) {
        logError(`[${type}] ${regionName} ${year}-${month} 오류: ${error.message}`);
        return { synced: 0, diff: 0, error: error.message };
    }
}

/**
 * 데이터 삽입 (UPSERT)
 */
async function insertData(items, type, regionCode, year, month) {
    if (!items || items.length === 0) return 0;

    const tableName = type === 'deal' ? 'apt_deal_info' : 'apt_rent_info';
    let insertedCount = 0;

    // 배치 크기
    const BATCH_SIZE = 100;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
            try {
                if (type === 'deal') {
                    // 매매 데이터 삽입 (현재 스키마에 맞게 간소화)
                    await executeQuery(`
            INSERT INTO apt_deal_info 
            (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay, dealAmount, 
             buildYear, aptDong, buyerGbn, cdealDay, cdealType, dealingGbn, estateAgentSggNm,
             jibun, landLeaseholdGbn, rgstDate, slerGbn, umdNm)
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
                        year,
                        month,
                        parseInt(item.dealDay) || 0,
                        parseInt(String(item.dealAmount || '0').replace(/,/g, '')) || 0,
                        parseInt(item.buildYear) || 0,
                        item.aptDong || '',
                        item.buyerGbn || '',
                        item.cdealDay || '',
                        item.cdealType || '',
                        item.dealingGbn || '',
                        item.estateAgentSggNm || '',
                        item.jibun || '',
                        item.landLeaseholdGbn || '',
                        item.rgstDate || '',
                        item.slerGbn || '',
                        item.umdNm || ''
                    ]);
                } else {
                    // 전월세 데이터 삽입 (현재 스키마에 맞게 간소화)
                    await executeQuery(`
            INSERT INTO apt_rent_info 
            (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay,
             monthlyRent, deposit, buildYear, aptDong, contractType, contractTerm,
             jibun, preDeposit, preMonthlyRent, useRRRight, umdNm)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              monthlyRent = VALUES(monthlyRent),
              deposit = VALUES(deposit),
              contractType = VALUES(contractType)
          `, [
                        regionCode,
                        item.aptNm || '',
                        parseFloat(item.excluUseAr) || 0,
                        parseInt(item.floor) || 0,
                        year,
                        month,
                        parseInt(item.dealDay) || 0,
                        parseInt(String(item.monthlyRent || '0').replace(/,/g, '')) || 0,
                        parseInt(String(item.deposit || '0').replace(/,/g, '')) || 0,
                        parseInt(item.buildYear) || 0,
                        item.aptDong || '',
                        item.contractType || '',
                        item.contractTerm || '',
                        item.jibun || '',
                        parseInt(String(item.preDeposit || '0').replace(/,/g, '')) || 0,
                        parseInt(String(item.preMonthlyRent || '0').replace(/,/g, '')) || 0,
                        item.useRRRight || '',
                        item.umdNm || ''
                    ]);
                }
                insertedCount++;
            } catch (err) {
                // 중복 키 에러는 무시 (이미 존재하는 데이터)
                if (!err.message.includes('Duplicate')) {
                    logError(`삽입 오류: ${err.message}`);
                }
            }
        }
    }

    return insertedCount;
}

/**
 * 메인 실행
 */
async function main() {
    const startTime = Date.now();

    // DB 연결 테스트
    const connected = await testConnection();
    if (!connected) {
        logError('DB 연결 실패. 종료합니다.');
        process.exit(1);
    }

    const targetMonths = getTargetMonths(MONTHS_TO_CHECK);
    const regionEntries = Object.entries(REGIONS);

    log(`검증 대상: ${targetMonths.length}개월 × ${regionEntries.length}개 지역 × 2 (매매/전월세)`);
    log(`검증 기간: ${targetMonths[targetMonths.length - 1].year}-${targetMonths[targetMonths.length - 1].month} ~ ${targetMonths[0].year}-${targetMonths[0].month}`);

    let totalSynced = { deal: 0, rent: 0 };
    let totalDiff = { deal: 0, rent: 0 };
    let processedCount = 0;
    const totalTasks = targetMonths.length * regionEntries.length * 2;

    for (const { year, month } of targetMonths) {
        console.log(`\n📅 ${year}년 ${month}월 검증 중...`);

        for (const [regionName, regionCode] of regionEntries) {
            // 매매
            const dealResult = await verifyAndRecoverRegionMonth(regionName, regionCode, year, month, 'deal');
            totalSynced.deal += dealResult.synced;
            totalDiff.deal += dealResult.diff > 0 ? dealResult.diff : 0;
            processedCount++;

            // 전월세
            const rentResult = await verifyAndRecoverRegionMonth(regionName, regionCode, year, month, 'rent');
            totalSynced.rent += rentResult.synced;
            totalDiff.rent += rentResult.diff > 0 ? rentResult.diff : 0;
            processedCount++;

            // 진행률 표시 (100개마다)
            if (processedCount % 100 === 0) {
                const progress = ((processedCount / totalTasks) * 100).toFixed(1);
                process.stdout.write(`\r   진행률: ${progress}% (${processedCount}/${totalTasks})`);
            }
        }
    }

    const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);

    console.log(`

============================================================
  동기화 완료
============================================================

📊 통계:
   매매 - 불일치 발견: ${totalDiff.deal}건, 동기화: ${totalSynced.deal}건
   전월세 - 불일치 발견: ${totalDiff.rent}건, 동기화: ${totalSynced.rent}건
   소요 시간: ${elapsedMinutes}분

[${new Date().toISOString()}] ✅ ${mode === 'weekly' ? '주간' : '일일'} 동기화 완료!
`);

    // 대시보드 캐시 갱신
    await refreshDashboardCache();

    // 검색 인덱스 갱신
    await refreshSearchIndex();

    await closeConnection();
}

/**
 * 대시보드 통계 캐시 갱신
 */
async function refreshDashboardCache() {
    console.log(`
============================================================
  📊 대시보드 캐시 갱신 시작
============================================================
`);

    const cacheStartTime = Date.now();

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

        // 시도 목록 조회
        const sidoRows = await executeQuery(`
            SELECT DISTINCT as1 FROM apt_list WHERE as1 IS NOT NULL AND as1 != '' ORDER BY as1
        `);
        const sidoList = ['ALL', ...sidoRows.map(r => r.as1)];

        // 전국 최신 거래일 조회 (모든 지역에서 통일된 날짜 사용)
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
            log(`전국 최신 거래일: ${dealYear}-${String(dealMonth).padStart(2, '0')}-${String(dealDay).padStart(2, '0')}`);
        }

        log(`캐시 갱신 대상: ${sidoList.length}개 지역`);

        for (const sido of sidoList) {
            await updateCacheForRegion(sido, globalLatestDate);
        }

        const cacheElapsed = ((Date.now() - cacheStartTime) / 1000).toFixed(1);
        console.log(`
[${new Date().toISOString()}] ✅ 대시보드 캐시 갱신 완료! (${cacheElapsed}초)
`);

    } catch (error) {
        logError(`캐시 갱신 오류: ${error.message}`);
    }
}

/**
 * 특정 지역의 캐시 갱신
 * @param {string} sido - 시도명 ('ALL' 또는 시도명)
 * @param {object} globalLatestDate - 전국 최신 거래일 { dealYear, dealMonth, dealDay }
 */
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

        // 3. 일일 거래량 (전국 최신 거래일 기준으로 통일)
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

        // 캐시 저장
        const cacheData = {
            topRegion,
            monthlyVolume: monthlyRows[0]?.count || 0,
            todayVolume,
            latestDate: latestDateStr,
            cancelledCount: cancelledRows[0]?.count || 0
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

/**
 * 검색 인덱스 갱신
 * 신규 아파트 추가 및 거래 건수 업데이트
 */
async function refreshSearchIndex() {
    console.log(`
============================================================
  🔍 검색 인덱스 갱신 시작
============================================================
`);

    const startTime = Date.now();

    try {
        // UPSERT로 신규 아파트 추가 및 기존 아파트 거래 건수 업데이트
        const result = await executeQuery(`
            INSERT INTO apt_search_index (aptNm, umdNm, sggCd, sido, sigungu, dealCount, lastDealDate)
            SELECT 
                d.aptNm,
                d.umdNm,
                d.sggCd,
                l.as1 as sido,
                l.as2 as sigungu,
                COUNT(*) as dealCount,
                MAX(DATE(d.dealDate)) as lastDealDate
            FROM apt_deal_info d
            JOIN (
                SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2
                FROM apt_list
            ) l ON d.sggCd = l.sggCode
            WHERE d.aptNm IS NOT NULL AND d.aptNm != ''
            GROUP BY d.aptNm, d.umdNm, d.sggCd, l.as1, l.as2
            ON DUPLICATE KEY UPDATE
                dealCount = VALUES(dealCount),
                lastDealDate = VALUES(lastDealDate),
                updated_at = CURRENT_TIMESTAMP
        `);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`검색 인덱스 갱신 완료: ${result.affectedRows}개 행 업데이트 (${elapsed}초)`);

    } catch (error) {
        logError(`검색 인덱스 갱신 오류: ${error.message}`);
    }
}

main().catch(err => {
    logError(`치명적 오류: ${err.message}`);
    process.exit(1);
});
