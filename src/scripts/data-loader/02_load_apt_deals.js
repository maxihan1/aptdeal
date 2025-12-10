/**
 * 02_load_apt_deals.js
 * 국토교통부 아파트 매매 실거래가 데이터 적재
 * 
 * 사용법:
 *   node src/scripts/data-loader/02_load_apt_deals.js              # 전체 적재 (2015~현재)
 *   node src/scripts/data-loader/02_load_apt_deals.js --year=2015  # 특정 연도만
 *   node src/scripts/data-loader/02_load_apt_deals.js --start-year=2015 --end-year=2020  # 기간 지정
 */

import { executeQuery, executeTransaction, closeConnection, testConnection } from './utils/db.js';
import { fetchAptDeals } from './utils/api.js';
import { log, logError, logSuccess, logWarning, logSection, logStats, logProgress, logProgressEnd } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정
const CONFIG = {
    DATA_TYPE: 'deal',
    BATCH_SIZE: 500, // 한 번에 INSERT할 건수
    START_YEAR: 2015,
    END_YEAR: new Date().getFullYear(),
};

// 지역 코드 로드
const lawdCdMapPath = path.join(__dirname, '..', '..', '..', 'lawd_cd_map.json');
const lawdCdMap = JSON.parse(fs.readFileSync(lawdCdMapPath, 'utf-8'));

// 시군구 단위 지역 코드만 추출 (5자리)
const regionCodes = Object.entries(lawdCdMap)
    .filter(([name, code]) => code.length === 5 && !name.endsWith('시') && !name.endsWith('도'))
    .map(([name, code]) => ({ name, code }));

/**
 * 커맨드라인 인수 파싱
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        startYear: CONFIG.START_YEAR,
        endYear: CONFIG.END_YEAR,
    };

    for (const arg of args) {
        if (arg.startsWith('--year=')) {
            const year = parseInt(arg.split('=')[1]);
            options.startYear = year;
            options.endYear = year;
        } else if (arg.startsWith('--start-year=')) {
            options.startYear = parseInt(arg.split('=')[1]);
        } else if (arg.startsWith('--end-year=')) {
            options.endYear = parseInt(arg.split('=')[1]);
        }
    }

    return options;
}

/**
 * 이미 완료된 작업 목록 조회
 */
async function getCompletedTasks() {
    const rows = await executeQuery(`
    SELECT year, month, region_code 
    FROM data_load_progress 
    WHERE data_type = ? AND status = 'completed'
  `, [CONFIG.DATA_TYPE]);

    const completed = new Set();
    rows.forEach(row => {
        completed.add(`${row.year}-${row.month}-${row.region_code}`);
    });

    return completed;
}

/**
 * 진행 상황 업데이트
 */
async function updateProgress(year, month, regionCode, regionName, status, apiCount = 0, dbCount = 0, errorMsg = null) {
    await executeQuery(`
    INSERT INTO data_load_progress 
      (data_type, year, month, region_code, region_name, status, api_response_count, db_record_count, error_message, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
      CASE WHEN ? = 'in_progress' THEN NOW() ELSE NULL END,
      CASE WHEN ? IN ('completed', 'failed') THEN NOW() ELSE NULL END
    )
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      api_response_count = VALUES(api_response_count),
      db_record_count = VALUES(db_record_count),
      error_message = VALUES(error_message),
      started_at = CASE WHEN VALUES(status) = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
      completed_at = CASE WHEN VALUES(status) IN ('completed', 'failed') THEN NOW() ELSE completed_at END
  `, [CONFIG.DATA_TYPE, year, month, regionCode, regionName, status, apiCount, dbCount, errorMsg, status, status]);
}

/**
 * 실패 요청 기록
 */
async function recordFailedRequest(year, month, regionCode, regionName, errorCode, errorMsg) {
    await executeQuery(`
    INSERT INTO failed_requests (data_type, year, month, region_code, region_name, error_code, error_message, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE retry_count = retry_count + 1, error_message = VALUES(error_message)
  `, [CONFIG.DATA_TYPE, year, month, regionCode, regionName, errorCode, errorMsg]);
}

/**
 * API 응답 데이터를 DB 레코드로 변환
 */
function transformDealData(deal, regionCode, regionName, year, month) {
    // 거래금액 파싱 (쉼표 제거)
    const dealAmount = parseInt(String(deal.거래금액 || deal.dealAmount || '0').replace(/,/g, '').trim());

    return {
        sggCd: regionCode,
        aptNm: deal.아파트 || deal.aptNm || '',
        excluUseAr: parseFloat(deal.전용면적 || deal.excluUseAr || 0),
        floor: parseInt(deal.층 || deal.floor || 0),
        dealYear: parseInt(deal.년 || deal.dealYear || year),
        dealMonth: parseInt(deal.월 || deal.dealMonth || month),
        dealDay: parseInt(deal.일 || deal.dealDay || 0),
        dealAmount: dealAmount,
        buildYear: parseInt(deal.건축년도 || deal.buildYear || 0),
        aptDong: deal.동 || deal.aptDong || '',
        jibun: deal.지번 || deal.jibun || '',
        umdNm: deal.법정동 || deal.umdNm || '',
        buyerGbn: deal.매수자 || deal.buyerGbn || '',
        slerGbn: deal.매도자 || deal.slerGbn || '',
        dealingGbn: deal.거래유형 || deal.dealingGbn || '',
        estateAgentSggNm: deal.중개사소재지 || deal.dealerLawdnm || '',
        landLeaseholdGbn: deal.토지임대부아파트여부 || deal.landLeasHoldGbn || '',
        cdealDay: deal.해제사유발생일 || deal.cdealDay || '',
        cdealType: deal.해제여부 || deal.cdealType || '',
        rgstDate: deal.등기일자 || deal.rgstDate || '',
    };
}

/**
 * 배치 INSERT 실행
 */
async function batchInsertDeals(deals) {
    if (deals.length === 0) return 0;

    const columns = [
        'sggCd', 'aptNm', 'excluUseAr', 'floor', 'dealYear', 'dealMonth', 'dealDay',
        'dealAmount', 'buildYear', 'aptDong', 'jibun', 'umdNm', 'buyerGbn',
        'slerGbn', 'dealingGbn', 'estateAgentSggNm', 'landLeaseholdGbn',
        'cdealDay', 'cdealType', 'rgstDate'
    ];

    const placeholders = deals.map(() =>
        `(${columns.map(() => '?').join(', ')})`
    ).join(', ');

    const values = deals.flatMap(deal => columns.map(col => deal[col]));

    const query = `
    INSERT INTO apt_deal_info (${columns.join(', ')})
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      dealAmount = VALUES(dealAmount),
      cdealType = VALUES(cdealType),
      cdealDay = VALUES(cdealDay),
      updated_at = NOW()
  `;

    const [result] = await executeQuery(query, values).catch(err => {
        // 단건씩 재시도
        logWarning('배치 INSERT 실패 (경고), 단건 INSERT로 전환...');
        return [{ affectedRows: 0 }];
    });

    return result?.affectedRows || 0;
}

/**
 * 월별 데이터 적재
 */
async function loadMonthData(year, month, regionCode, regionName, serviceKey) {
    const dealYmd = `${year}${String(month).padStart(2, '0')}`;

    try {
        // 진행 상태 업데이트
        await updateProgress(year, month, regionCode, regionName, 'in_progress');

        // API 호출
        const deals = await fetchAptDeals(regionCode, dealYmd, serviceKey);
        const apiCount = deals.length;

        if (apiCount === 0) {
            await updateProgress(year, month, regionCode, regionName, 'completed', 0, 0);
            return { success: true, apiCount: 0, dbCount: 0 };
        }

        // 데이터 변환
        const transformedDeals = deals.map(deal =>
            transformDealData(deal, regionCode, regionName, year, month)
        );

        // 배치 INSERT
        let totalInserted = 0;
        for (let i = 0; i < transformedDeals.length; i += CONFIG.BATCH_SIZE) {
            const batch = transformedDeals.slice(i, i + CONFIG.BATCH_SIZE);
            const inserted = await batchInsertDeals(batch);
            totalInserted += inserted;
        }

        // 검증: API 건수 vs DB 건수
        const [result] = await executeQuery(`
      SELECT COUNT(*) as cnt FROM apt_deal_info 
      WHERE region_code = ? AND deal_year = ? AND deal_month = ?
    `, [regionCode, year, month]);
        const dbCount = result?.cnt || 0;

        // 결과 기록
        if (apiCount === dbCount || dbCount >= apiCount) {
            await updateProgress(year, month, regionCode, regionName, 'completed', apiCount, dbCount);
            return { success: true, apiCount, dbCount };
        } else {
            await updateProgress(year, month, regionCode, regionName, 'mismatch', apiCount, dbCount);
            logWarning(`불일치: ${regionName} ${year}-${month} (API: ${apiCount}, DB: ${dbCount})`);
            return { success: true, apiCount, dbCount, mismatch: true };
        }

    } catch (error) {
        const errorMsg = error.message || '알 수 없는 에러';
        await updateProgress(year, month, regionCode, regionName, 'failed', 0, 0, errorMsg);
        await recordFailedRequest(year, month, regionCode, regionName, error.code || 'UNKNOWN', errorMsg);
        return { success: false, error: errorMsg };
    }
}

/**
 * 메인 함수
 */
async function main() {
    logSection('아파트 매매 실거래가 데이터 적재');

    // 인수 파싱
    const options = parseArgs();
    log(`📅 적재 기간: ${options.startYear}년 ~ ${options.endYear}년`);
    log(`📍 지역 수: ${regionCodes.length}개`);

    // 연결 테스트
    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결에 실패했습니다.');
        process.exit(1);
    }

    // 서비스 키 확인
    const serviceKey = process.env.SERVICE_KEY;
    if (!serviceKey) {
        logError('SERVICE_KEY 환경 변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    // 완료된 작업 목록
    const completed = await getCompletedTasks();
    log(`✅ 이미 완료된 작업: ${completed.size}개`);

    // 통계
    const stats = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        mismatch: 0,
        totalRecords: 0,
    };

    // 연도별 → 월별 → 지역별 순회
    for (let year = options.startYear; year <= options.endYear; year++) {
        logSection(`${year}년 데이터 적재`);

        const maxMonth = (year === new Date().getFullYear()) ? new Date().getMonth() + 1 : 12;

        for (let month = 1; month <= maxMonth; month++) {
            log(`\n📅 ${year}년 ${month}월 처리 중...`);

            let monthSuccess = 0;
            let monthFailed = 0;
            let monthRecords = 0;

            for (let i = 0; i < regionCodes.length; i++) {
                const { code, name } = regionCodes[i];
                const taskKey = `${year}-${month}-${code}`;

                stats.total++;

                // 이미 완료된 작업 스킵
                if (completed.has(taskKey)) {
                    stats.skipped++;
                    continue;
                }

                logProgress(`   [${i + 1}/${regionCodes.length}] ${name}...`);

                const result = await loadMonthData(year, month, code, name, serviceKey);

                if (result.success) {
                    stats.success++;
                    monthSuccess++;
                    monthRecords += result.dbCount || 0;
                    stats.totalRecords += result.dbCount || 0;

                    if (result.mismatch) {
                        stats.mismatch++;
                    }
                } else {
                    stats.failed++;
                    monthFailed++;
                    logError(`   실패: ${name} - ${result.error}`);
                }
            }

            logProgressEnd();
            log(`   ✅ ${year}년 ${month}월 완료: 성공 ${monthSuccess}, 실패 ${monthFailed}, 적재 ${monthRecords}건`);
        }
    }

    // 최종 통계
    logSection('적재 완료');
    logStats({
        '전체 작업': stats.total,
        '성공': stats.success,
        '실패': stats.failed,
        '스킵 (이미 완료)': stats.skipped,
        '데이터 불일치': stats.mismatch,
        '총 적재 건수': stats.totalRecords.toLocaleString(),
    });

    if (stats.failed > 0) {
        logWarning(`실패한 작업이 ${stats.failed}건 있습니다. 05_recover_missing.js를 실행하여 복구하세요.`);
    }

    await closeConnection();
    logSuccess('데이터 적재가 완료되었습니다!');
}

main().catch(error => {
    logError('스크립트 실행 실패:', error);
    closeConnection();
    process.exit(1);
});
