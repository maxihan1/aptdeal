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
import { fetchWithRetry, getAPITotalCount, API_CONFIG } from './utils/api.js';
import { logInfo, logError, logWarning } from './utils/logger.js';
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
    logInfo(`지역 코드 로드 완료: ${Object.keys(REGIONS).length}개`);
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
            const items = await fetchWithRetry(apiUrl, regionCode, dealYmd, SERVICE_KEY);

            if (items && items.length > 0) {
                // 데이터 변환 및 삽입
                const insertedCount = await insertData(items, type, regionCode, year, month);
                logInfo(`[${type}] ${regionName} ${year}-${month}: ${insertedCount}건 복구 완료`);
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
                    // 매매 데이터 삽입
                    await executeQuery(`
            INSERT INTO apt_deal_info 
            (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay, dealAmount, 
             buildYear, aptDong, buyerGbn, cdealDay, cdealType, dealingGbn, estateAgentSggNm,
             jibun, landLeaseholdGbn, rgstDate, roadNm, roadNmBonbun, roadNmBuilCode,
             roadNmCd, roadNmSeq, roadNmSggCd, roadNmSubbun, slerGbn, umdCd, umdNm)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        item.roadNm || '',
                        item.roadNmBonbun || '',
                        item.roadNmBuilCode || '',
                        item.roadNmCd || '',
                        item.roadNmSeq || '',
                        item.roadNmSggCd || '',
                        item.roadNmSubbun || '',
                        item.slerGbn || '',
                        item.umdCd || '',
                        item.umdNm || ''
                    ]);
                } else {
                    // 전월세 데이터 삽입
                    await executeQuery(`
            INSERT INTO apt_rent_info 
            (sggCd, aptNm, excluUseAr, floor, dealYear, dealMonth, dealDay,
             monthlyRent, preDeposit, buildYear, aptDong, contractType, contractTerm,
             jibun, previousDeposit, previousMonthlyRent, renewalContractDate,
             roadNm, roadNmBonbun, roadNmBuilCode, roadNmCd, roadNmSeq, 
             roadNmSggCd, roadNmSubbun, useRRRight, umdCd, umdNm)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              monthlyRent = VALUES(monthlyRent),
              preDeposit = VALUES(preDeposit),
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
                        parseInt(String(item.deposit || item.preDeposit || '0').replace(/,/g, '')) || 0,
                        parseInt(item.buildYear) || 0,
                        item.aptDong || '',
                        item.contractType || '',
                        item.contractTerm || '',
                        item.jibun || '',
                        parseInt(String(item.previousDeposit || '0').replace(/,/g, '')) || 0,
                        parseInt(String(item.previousMonthlyRent || '0').replace(/,/g, '')) || 0,
                        item.renewalContractDate || '',
                        item.roadNm || '',
                        item.roadNmBonbun || '',
                        item.roadNmBuilCode || '',
                        item.roadNmCd || '',
                        item.roadNmSeq || '',
                        item.roadNmSggCd || '',
                        item.roadNmSubbun || '',
                        item.useRRRight || '',
                        item.umdCd || '',
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

    logInfo(`검증 대상: ${targetMonths.length}개월 × ${regionEntries.length}개 지역 × 2 (매매/전월세)`);
    logInfo(`검증 기간: ${targetMonths[targetMonths.length - 1].year}-${targetMonths[targetMonths.length - 1].month} ~ ${targetMonths[0].year}-${targetMonths[0].month}`);

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

    await closeConnection();
}

main().catch(err => {
    logError(`치명적 오류: ${err.message}`);
    process.exit(1);
});
