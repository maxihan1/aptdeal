/**
 * 일일/주간 자동 동기화 스크립트
 * 
 * 사용법:
 *   node 06_daily_sync.js --mode=daily   # 최근 3개월 (매일 실행)
 *   node 06_daily_sync.js --mode=weekly  # 최근 6개월 + 신규 단지 보완 (매주 화요일)
 * 
 * 크론탭 예시:
 *   # 매일 새벽 4시
 *   0 4 * * * cd /path/to/web && node src/scripts/data-loader/06_daily_sync.js --mode=daily >> sync.log 2>&1
 *   # 매주 화요일 새벽 5시 (일일 동기화 이후)
 *   0 5 * * 2 cd /path/to/web && node src/scripts/data-loader/06_daily_sync.js --mode=weekly >> sync.log 2>&1
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

    // 지도용 캐시 갱신 (아파트 가격 + 지역별)
    await refreshMapCaches();

    // 주간 모드에서만 실행: 신규 단지 보완 작업
    if (mode === 'weekly') {
        await weeklyMaintenanceTasks();
    }

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

        // 디버그 로그
        if (!Array.isArray(sidoRows)) {
            logWarning(`sidoRows is not an array: ${typeof sidoRows}, value: ${JSON.stringify(sidoRows)}`);
        } else {
            log(`시도 목록 조회 완료: ${sidoRows.length}개`);
        }

        const sidoList = ['ALL', ...(Array.isArray(sidoRows) ? sidoRows.map(r => r.as1) : [])];

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

        log(`검색 인덱스 갱신 완료: ${result.affectedRows}개 행 업데이트`);

        // apt_search_index → apt_name_mapping 동기화
        // 캐시 생성 시 apt_name_mapping을 사용하므로, 검색 인덱스와 동기화 필요
        log('🔗 apt_name_mapping 동기화 중...');
        const syncResult = await executeQuery(`
            INSERT IGNORE INTO apt_name_mapping (deal_apt_name, kapt_code)
            SELECT aptNm, kapt_code
            FROM apt_search_index
            WHERE kapt_code IS NOT NULL 
              AND kapt_code != 'UNMAPPED'
              AND kapt_code != ''
        `);
        log(`   apt_name_mapping 동기화: ${syncResult.affectedRows}개 추가`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`✅ 검색 인덱스 및 매핑 동기화 완료 (${elapsed}초)`);

    } catch (error) {
        logError(`검색 인덱스 갱신 오류: ${error.message}`);
    }
}

/**
 * 지도용 캐시 갱신 (아파트 가격 + 지역별)
 */
async function refreshMapCaches() {
    console.log(`
============================================================
  🗺️ 지도용 캐시 갱신 시작
============================================================
`);

    const startTime = Date.now();

    try {
        // 0. 아파트 가격 캐시 갱신 (추가)
        log('📊 아파트 가격 캐시 갱신 중...');
        const { refreshPriceCache } = await import('./create_price_cache.js');
        await refreshPriceCache();

        // 0.5. 전월세 캐시 추가
        log('🏠 전월세 캐시 추가 중...');
        const { addRentToCache } = await import('./add_rent_to_price_cache.js');
        await addRentToCache();

        // 1. 지역 가격 캐시 갱신
        log('📊 지역 가격 캐시 갱신 중...');
        const { refreshRegionCache } = await import('./create_region_cache.js');
        await refreshRegionCache();

        // 1.5. 지역 전세 가격 캐시 추가
        log('🏠 지역 전세 가격 캐시 추가 중...');
        const { addRentToRegionCache } = await import('./add_rent_to_region_cache.js');
        await addRentToRegionCache();

        // 2. 사이드바 캐시 갱신
        log('📋 사이드바 캐시 갱신 중...');
        const { refreshSidebarCache } = await import('./create_sidebar_cache.js');
        await refreshSidebarCache();

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`✅ 지도용 캐시 갱신 완료 (${elapsed}초)`);

    } catch (error) {
        logError(`지도용 캐시 갱신 오류: ${error.message}`);
    }
}

/**
 * 주간 전용: 신규 아파트 보완 작업
 * - displayName 업데이트 (카카오 검색)
 * - 좌표 수집 (좌표 없는 단지)
 * - K-apt 매핑 (미매핑 단지)
 */
async function weeklyMaintenanceTasks() {
    console.log(`
============================================================
  🔧 주간 신규 단지 보완 작업 시작
============================================================
`);

    const startTime = Date.now();
    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

    if (!KAKAO_REST_API_KEY) {
        logWarning('KAKAO_REST_API_KEY가 설정되지 않아 주간 보완 작업을 건너뜁니다.');
        return;
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        // 1. displayName이 없는 신규 아파트 업데이트 (최대 200개)
        log('📝 1단계: displayName이 없는 아파트 업데이트...');

        const aptsNeedDisplayName = await executeQuery(`
            SELECT si.id, si.aptNm, si.umdNm, si.kapt_code,
                   b.latitude, b.longitude, b.kaptAddr
            FROM apt_search_index si
            LEFT JOIN apt_basic_info b ON si.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.displayName IS NULL 
            ORDER BY si.dealCount DESC
            LIMIT 200
        `);

        let displayNameUpdated = 0;
        for (const apt of aptsNeedDisplayName) {
            try {
                const searchQuery = apt.kaptAddr || `${apt.umdNm} ${apt.aptNm}`;
                const response = await fetch(
                    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchQuery + ' 아파트')}&size=3`,
                    { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.documents && data.documents.length > 0) {
                        const aptDoc = data.documents.find(d => d.category_name?.includes('아파트')) || data.documents[0];
                        const displayName = aptDoc.place_name.replace(/아파트$/g, '').trim();

                        await executeQuery(`UPDATE apt_search_index SET displayName = ? WHERE id = ?`, [displayName, apt.id]);
                        displayNameUpdated++;
                    } else {
                        // 카카오 미검색 시 aptNm 사용
                        await executeQuery(`UPDATE apt_search_index SET displayName = ? WHERE id = ?`, [apt.aptNm, apt.id]);
                    }
                }
                await sleep(100);
            } catch (e) {
                // 개별 오류 무시
            }
        }
        log(`   ✅ displayName 업데이트: ${displayNameUpdated}/${aptsNeedDisplayName.length}개`);

        // 2. 좌표가 없는 아파트에 좌표 추가 (최대 100개)
        log('📍 2단계: 좌표가 없는 아파트에 좌표 추가...');

        const aptsNeedCoords = await executeQuery(`
            SELECT kaptCode, kaptName, kaptAddr 
            FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL AND kaptAddr != ''
            LIMIT 100
        `);

        let coordsUpdated = 0;
        for (const apt of aptsNeedCoords) {
            try {
                const response = await fetch(
                    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(apt.kaptAddr)}`,
                    { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.documents && data.documents.length > 0) {
                        const doc = data.documents[0];
                        await executeQuery(
                            `UPDATE apt_basic_info SET latitude = ?, longitude = ? WHERE kaptCode = ?`,
                            [parseFloat(doc.y), parseFloat(doc.x), apt.kaptCode]
                        );
                        coordsUpdated++;
                    }
                }
                await sleep(100);
            } catch (e) {
                // 개별 오류 무시
            }
        }
        log(`   ✅ 좌표 업데이트: ${coordsUpdated}/${aptsNeedCoords.length}개`);

        // 3. kapt_code가 없는 아파트에 K-apt 매핑 시도 (지번 기반, 최대 100개)
        log('🔗 3단계: K-apt 미매핑 아파트 매핑 시도...');

        const unmappedApts = await executeQuery(`
            SELECT id, aptNm, umdNm, sggCd, jibun
            FROM apt_search_index
            WHERE (kapt_code IS NULL OR kapt_code = 'UNMAPPED')
            AND jibun IS NOT NULL AND jibun != ''
            LIMIT 100
        `);

        let mapped = 0;
        for (const apt of unmappedApts) {
            try {
                // 지번 기반으로 apt_basic_info에서 매칭 시도
                const matches = await executeQuery(`
                    SELECT kaptCode, kaptName
                    FROM apt_basic_info
                    WHERE kaptAddr LIKE CONCAT('%', ?, '%')
                    LIMIT 1
                `, [apt.jibun]);

                if (matches.length > 0) {
                    await executeQuery(
                        `UPDATE apt_search_index SET kapt_code = ? WHERE id = ?`,
                        [matches[0].kaptCode, apt.id]
                    );
                    mapped++;
                }
            } catch (e) {
                // 개별 오류 무시
            }
        }
        log(`   ✅ K-apt 매핑: ${mapped}/${unmappedApts.length}개`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`
[${new Date().toISOString()}] ✅ 주간 보완 작업 완료 (${elapsed}초)
   - displayName: ${displayNameUpdated}개
   - 좌표: ${coordsUpdated}개
   - K-apt 매핑: ${mapped}개
`);

    } catch (error) {
        logError(`주간 보완 작업 오류: ${error.message}`);
    }
}

main().catch(err => {
    logError(`치명적 오류: ${err.message}`);
    process.exit(1);
});
