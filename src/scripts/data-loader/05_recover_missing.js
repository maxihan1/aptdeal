/**
 * 05_recover_missing.js
 * 누락된 데이터 복구
 * data_audit 테이블에서 불일치(mismatch) 항목을 찾아 재적재
 * 
 * 사용법:
 *   node src/scripts/data-loader/05_recover_missing.js              # 전체 복구
 *   node src/scripts/data-loader/05_recover_missing.js --type=deal  # 매매만 복구
 *   node src/scripts/data-loader/05_recover_missing.js --type=rent  # 전월세만 복구
 */

import { executeQuery, closeConnection, testConnection } from './utils/db.js';
import { fetchAptDeals, fetchAptRents } from './utils/api.js';
import { log, logError, logSuccess, logWarning, logSection, logStats, logProgress, logProgressEnd } from './utils/logger.js';

/**
 * 커맨드라인 인수 파싱
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        type: 'all', // deal, rent, all
        maxRetries: 3,
    };

    for (const arg of args) {
        if (arg.startsWith('--type=')) {
            options.type = arg.split('=')[1];
        } else if (arg.startsWith('--max-retries=')) {
            options.maxRetries = parseInt(arg.split('=')[1]);
        }
    }

    return options;
}

/**
 * 불일치 항목 조회
 */
async function getMismatchItems(dataType = null) {
    let query = `
    SELECT data_type, year, month, region_code, region_name, api_count, db_count
    FROM data_audit 
    WHERE status = 'mismatch'
  `;
    const params = [];

    if (dataType) {
        query += ' AND data_type = ?';
        params.push(dataType);
    }

    query += ' ORDER BY year, month, region_code';

    return await executeQuery(query, params);
}

/**
 * 실패한 요청 조회
 */
async function getFailedRequests(dataType = null) {
    let query = `
    SELECT data_type, year, month, region_code, region_name, retry_count
    FROM failed_requests 
    WHERE resolved = FALSE
  `;
    const params = [];

    if (dataType) {
        query += ' AND data_type = ?';
        params.push(dataType);
    }

    query += ' ORDER BY retry_count, year, month';

    return await executeQuery(query, params);
}

/**
 * 매매 데이터 변환
 */
function transformDealData(deal, regionCode, regionName, year, month) {
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
 * 전월세 데이터 변환
 */
function transformRentData(rent, regionCode, regionName, year, month) {
    const deposit = parseInt(String(rent.보증금액 || rent.보증금 || rent.deposit || rent.rentGtn || '0').replace(/,/g, '').trim());
    const monthlyRent = parseInt(String(rent.월세금액 || rent.월세 || rent.monthlyRent || rent.rentFee || '0').replace(/,/g, '').trim());
    const preDeposit = parseInt(String(rent.종전계약보증금 || rent.prevDeposit || '0').replace(/,/g, '').trim()) || 0;
    const preMonthlyRent = parseInt(String(rent.종전계약월세 || rent.prevMonthlyRent || '0').replace(/,/g, '').trim()) || 0;

    return {
        sggCd: regionCode,
        aptNm: rent.아파트 || rent.aptNm || '',
        buildYear: parseInt(rent.건축년도 || rent.buildYear || 0),
        contractTerm: rent.계약기간 || rent.contractTerm || '',
        contractType: rent.신규갱신여부 || rent.contractType || rent.계약구분 || '',
        dealYear: parseInt(rent.년 || rent.dealYear || year),
        dealMonth: parseInt(rent.월 || rent.dealMonth || month),
        dealDay: parseInt(rent.일 || rent.dealDay || 0),
        deposit: deposit,
        excluUseAr: parseFloat(rent.전용면적 || rent.excluUseAr || 0),
        floor: parseInt(rent.층 || rent.floor || 0),
        jibun: rent.지번 || rent.jibun || '',
        monthlyRent: monthlyRent,
        preDeposit: preDeposit,
        preMonthlyRent: preMonthlyRent,
        umdNm: rent.법정동 || rent.umdNm || '',
        useRRRight: rent.갱신요구권사용 || rent.useRRRight || '',
    };
}

/**
 * 매매 데이터 복구
 */
async function recoverDeals(item, serviceKey) {
    const { year, month, region_code, region_name } = item;
    const dealYmd = `${year}${String(month).padStart(2, '0')}`;

    try {
        // API 재호출
        const deals = await fetchAptDeals(region_code, dealYmd, serviceKey);

        if (deals.length === 0) {
            return { success: true, recovered: 0 };
        }

        // 데이터 변환
        const transformedDeals = deals.map(deal =>
            transformDealData(deal, region_code, region_name, year, month)
        );

        // 배치 INSERT
        const columns = [
            'sggCd', 'aptNm', 'excluUseAr', 'floor', 'dealYear', 'dealMonth', 'dealDay',
            'dealAmount', 'buildYear', 'aptDong', 'jibun', 'umdNm', 'buyerGbn',
            'slerGbn', 'dealingGbn', 'estateAgentSggNm', 'landLeaseholdGbn',
            'cdealDay', 'cdealType', 'rgstDate'
        ];

        const BATCH_SIZE = 500;
        let totalRecovered = 0;

        for (let i = 0; i < transformedDeals.length; i += BATCH_SIZE) {
            const batch = transformedDeals.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() =>
                `(${columns.map(() => '?').join(', ')})`
            ).join(', ');

            const values = batch.flatMap(deal => columns.map(col => deal[col]));

            const query = `
        INSERT INTO apt_deal_info (${columns.join(', ')})
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          dealAmount = VALUES(dealAmount),
          cdealType = VALUES(cdealType),
          cdealDay = VALUES(cdealDay),
          updated_at = NOW()
      `;

            await executeQuery(query, values);
            totalRecovered += batch.length;
        }

        return { success: true, recovered: totalRecovered };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 전월세 데이터 복구
 */
async function recoverRents(item, serviceKey) {
    const { year, month, region_code, region_name } = item;
    const dealYmd = `${year}${String(month).padStart(2, '0')}`;

    try {
        // API 재호출
        const rents = await fetchAptRents(region_code, dealYmd, serviceKey);

        if (rents.length === 0) {
            return { success: true, recovered: 0 };
        }

        // 데이터 변환
        const transformedRents = rents.map(rent =>
            transformRentData(rent, region_code, region_name, year, month)
        );

        // 배치 INSERT
        const columns = [
            'sggCd', 'aptNm', 'buildYear', 'contractTerm', 'contractType',
            'dealYear', 'dealMonth', 'dealDay', 'deposit', 'excluUseAr',
            'floor', 'jibun', 'monthlyRent', 'preDeposit', 'preMonthlyRent',
            'umdNm', 'useRRRight'
        ];

        const BATCH_SIZE = 500;
        let totalRecovered = 0;

        for (let i = 0; i < transformedRents.length; i += BATCH_SIZE) {
            const batch = transformedRents.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() =>
                `(${columns.map(() => '?').join(', ')})`
            ).join(', ');

            const values = batch.flatMap(rent => columns.map(col => rent[col]));

            const query = `
        INSERT INTO apt_rent_info (${columns.join(', ')})
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          deposit = VALUES(deposit),
          monthlyRent = VALUES(monthlyRent),
          contractType = VALUES(contractType),
          updated_at = NOW()
      `;

            await executeQuery(query, values);
            totalRecovered += batch.length;
        }

        return { success: true, recovered: totalRecovered };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 복구 완료 표시
 */
async function markResolved(dataType, year, month, regionCode) {
    // data_audit 업데이트
    await executeQuery(`
    UPDATE data_audit SET status = 'resolved', resolved_at = NOW()
    WHERE data_type = ? AND year = ? AND month = ? AND region_code = ?
  `, [dataType, year, month, regionCode]);

    // failed_requests 업데이트
    await executeQuery(`
    UPDATE failed_requests SET resolved = TRUE, resolved_at = NOW()
    WHERE data_type = ? AND year = ? AND month = ? AND region_code = ?
  `, [dataType, year, month, regionCode]);

    // data_load_progress 업데이트
    await executeQuery(`
    UPDATE data_load_progress SET status = 'completed', completed_at = NOW()
    WHERE data_type = ? AND year = ? AND month = ? AND region_code = ?
  `, [dataType, year, month, regionCode]);
}

/**
 * 메인 함수
 */
async function main() {
    logSection('누락 데이터 복구');

    // 인수 파싱
    const options = parseArgs();
    log(`🔧 복구 유형: ${options.type}`);

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

    // 불일치 항목 조회
    const mismatchType = options.type === 'all' ? null : options.type;
    const mismatchItems = await getMismatchItems(mismatchType);
    const failedItems = await getFailedRequests(mismatchType);

    // 복구 대상 병합 (중복 제거)
    const recoverySet = new Map();

    [...mismatchItems, ...failedItems].forEach(item => {
        const key = `${item.data_type}-${item.year}-${item.month}-${item.region_code}`;
        if (!recoverySet.has(key)) {
            recoverySet.set(key, item);
        }
    });

    const recoveryItems = Array.from(recoverySet.values());

    log(`📋 복구 대상: ${recoveryItems.length}건`);

    if (recoveryItems.length === 0) {
        logSuccess('복구할 항목이 없습니다!');
        await closeConnection();
        return;
    }

    // 통계
    const stats = {
        total: recoveryItems.length,
        success: 0,
        failed: 0,
        recovered: 0,
    };

    // 복구 실행
    for (let i = 0; i < recoveryItems.length; i++) {
        const item = recoveryItems[i];
        const typeName = item.data_type === 'deal' ? '매매' : '전월세';

        logProgress(`[${i + 1}/${recoveryItems.length}] ${item.region_name} ${item.year}-${item.month} (${typeName})...`);

        let result;
        if (item.data_type === 'deal') {
            result = await recoverDeals(item, serviceKey);
        } else {
            result = await recoverRents(item, serviceKey);
        }

        if (result.success) {
            stats.success++;
            stats.recovered += result.recovered || 0;
            await markResolved(item.data_type, item.year, item.month, item.region_code);
        } else {
            stats.failed++;
            logError(`복구 실패: ${result.error}`);
        }
    }

    logProgressEnd();

    // 최종 통계
    logSection('복구 완료');
    logStats({
        '복구 대상': stats.total,
        '성공': stats.success,
        '실패': stats.failed,
        '복구된 레코드': stats.recovered.toLocaleString(),
    });

    if (stats.failed > 0) {
        logWarning(`${stats.failed}건의 복구에 실패했습니다. 로그를 확인해주세요.`);
    } else {
        logSuccess('모든 누락 데이터가 복구되었습니다!');
    }

    await closeConnection();
}

main().catch(error => {
    logError('스크립트 실행 실패:', error);
    closeConnection();
    process.exit(1);
});
