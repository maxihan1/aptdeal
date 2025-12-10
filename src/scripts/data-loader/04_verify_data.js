/**
 * 04_verify_data.js
 * 적재된 데이터 검증
 * API 총 건수와 DB 적재 건수를 비교하여 누락 여부 확인
 * 
 * 사용법:
 *   node src/scripts/data-loader/04_verify_data.js              # 전체 검증
 *   node src/scripts/data-loader/04_verify_data.js --type=deal  # 매매만 검증
 *   node src/scripts/data-loader/04_verify_data.js --type=rent  # 전월세만 검증
 *   node src/scripts/data-loader/04_verify_data.js --year=2023  # 특정 연도만
 */

import { executeQuery, closeConnection, testConnection } from './utils/db.js';
import { getAPITotalCount, API_CONFIG } from './utils/api.js';
import { log, logError, logSuccess, logWarning, logSection, logStats, logProgress, logProgressEnd } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 지역 코드 로드
const lawdCdMapPath = path.join(__dirname, '..', '..', '..', 'lawd_cd_map.json');
const lawdCdMap = JSON.parse(fs.readFileSync(lawdCdMapPath, 'utf-8'));

// 시군구 단위 지역 코드만 추출
const regionCodes = Object.entries(lawdCdMap)
    .filter(([name, code]) => code.length === 5 && !name.endsWith('시') && !name.endsWith('도'))
    .map(([name, code]) => ({ name, code }));

/**
 * 커맨드라인 인수 파싱
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        type: 'all', // deal, rent, all
        startYear: 2015,
        endYear: new Date().getFullYear(),
    };

    for (const arg of args) {
        if (arg.startsWith('--type=')) {
            options.type = arg.split('=')[1];
        } else if (arg.startsWith('--year=')) {
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
 * DB 건수 조회 (매매)
 */
async function getDealCount(regionCode, year, month) {
    const [result] = await executeQuery(`
    SELECT COUNT(*) as cnt FROM apt_deal_info 
    WHERE sggCd = ? AND dealYear = ? AND dealMonth = ?
  `, [regionCode, year, month]);
    return result?.cnt || 0;
}

/**
 * DB 건수 조회 (전월세)
 */
async function getRentCount(regionCode, year, month) {
    const [result] = await executeQuery(`
    SELECT COUNT(*) as cnt FROM apt_rent_info 
    WHERE sggCd = ? AND dealYear = ? AND dealMonth = ?
  `, [regionCode, year, month]);
    return result?.cnt || 0;
}

/**
 * 검증 결과 저장
 */
async function saveAuditResult(dataType, year, month, regionCode, regionName, apiCount, dbCount) {
    const status = apiCount === dbCount ? 'match' : 'mismatch';

    await executeQuery(`
    INSERT INTO data_audit (data_type, year, month, region_code, region_name, api_count, db_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      api_count = VALUES(api_count),
      db_count = VALUES(db_count),
      status = VALUES(status),
      audited_at = NOW()
  `, [dataType, year, month, regionCode, regionName, apiCount, dbCount, status]);

    return status === 'mismatch';
}

/**
 * 검증 실행
 */
async function verifyData(dataType, options, serviceKey) {
    const apiUrl = dataType === 'deal' ? API_CONFIG.DEAL_URL : API_CONFIG.RENT_URL;
    const getDbCount = dataType === 'deal' ? getDealCount : getRentCount;
    const typeName = dataType === 'deal' ? '매매' : '전월세';

    logSection(`${typeName} 데이터 검증`);

    const stats = {
        total: 0,
        match: 0,
        mismatch: 0,
        apiTotal: 0,
        dbTotal: 0,
        missingTotal: 0,
    };

    const mismatches = [];

    for (let year = options.startYear; year <= options.endYear; year++) {
        const maxMonth = (year === new Date().getFullYear()) ? new Date().getMonth() + 1 : 12;

        for (let month = 1; month <= maxMonth; month++) {
            log(`\n📅 ${year}년 ${month}월 검증 중...`);

            for (let i = 0; i < regionCodes.length; i++) {
                const { code, name } = regionCodes[i];
                const dealYmd = `${year}${String(month).padStart(2, '0')}`;

                stats.total++;
                logProgress(`   [${i + 1}/${regionCodes.length}] ${name}...`);

                try {
                    // API 총 건수 조회
                    const apiCount = await getAPITotalCount(apiUrl, code, dealYmd, serviceKey);

                    // DB 건수 조회
                    const dbCount = await getDbCount(code, year, month);

                    stats.apiTotal += apiCount;
                    stats.dbTotal += dbCount;

                    // 결과 저장 및 판정
                    const isMismatch = await saveAuditResult(dataType, year, month, code, name, apiCount, dbCount);

                    if (isMismatch) {
                        stats.mismatch++;
                        stats.missingTotal += (apiCount - dbCount);
                        mismatches.push({
                            year,
                            month,
                            regionCode: code,
                            regionName: name,
                            apiCount,
                            dbCount,
                            missing: apiCount - dbCount,
                        });
                    } else {
                        stats.match++;
                    }

                } catch (error) {
                    logError(`   검증 실패: ${name} - ${error.message}`);
                }
            }

            logProgressEnd();
        }
    }

    // 통계 출력
    logStats({
        '검증 항목': stats.total,
        '일치': stats.match,
        '불일치': stats.mismatch,
        'API 총 건수': stats.apiTotal.toLocaleString(),
        'DB 총 건수': stats.dbTotal.toLocaleString(),
        '누락 건수': stats.missingTotal.toLocaleString(),
    });

    // 불일치 상세 출력
    if (mismatches.length > 0) {
        logWarning(`\n⚠️ 데이터 불일치 발견 (${mismatches.length}건):`);
        console.log('\n| 연도 | 월 | 지역 | API | DB | 누락 |');
        console.log('|------|-----|------|-----|-----|------|');
        mismatches.slice(0, 20).forEach(m => {
            console.log(`| ${m.year} | ${m.month} | ${m.regionName} | ${m.apiCount} | ${m.dbCount} | ${m.missing} |`);
        });
        if (mismatches.length > 20) {
            console.log(`... 외 ${mismatches.length - 20}건`);
        }
    }

    return stats;
}

/**
 * 메인 함수
 */
async function main() {
    logSection('데이터 검증 시작');

    // 인수 파싱
    const options = parseArgs();
    log(`📅 검증 기간: ${options.startYear}년 ~ ${options.endYear}년`);
    log(`📊 검증 유형: ${options.type}`);

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

    const results = {};

    // 매매 검증
    if (options.type === 'all' || options.type === 'deal') {
        results.deal = await verifyData('deal', options, serviceKey);
    }

    // 전월세 검증
    if (options.type === 'all' || options.type === 'rent') {
        results.rent = await verifyData('rent', options, serviceKey);
    }

    // 최종 결과
    logSection('검증 완료');

    if (results.deal) {
        log(`📊 매매: ${results.deal.match}건 일치, ${results.deal.mismatch}건 불일치`);
    }
    if (results.rent) {
        log(`📊 전월세: ${results.rent.match}건 일치, ${results.rent.mismatch}건 불일치`);
    }

    const totalMismatch = (results.deal?.mismatch || 0) + (results.rent?.mismatch || 0);

    if (totalMismatch > 0) {
        logWarning(`\n총 ${totalMismatch}건의 불일치가 발견되었습니다.`);
        logWarning('05_recover_missing.js를 실행하여 누락 데이터를 복구하세요.');
    } else {
        logSuccess('\n모든 데이터가 정상적으로 적재되었습니다!');
    }

    await closeConnection();
}

main().catch(error => {
    logError('스크립트 실행 실패:', error);
    closeConnection();
    process.exit(1);
});
