/**
 * API 호출 유틸리티
 * 지수 백오프 재시도 로직 포함
 */

import axios from 'axios';
import { log, logError } from './logger.js';

// API 설정
const API_CONFIG = {
    DEAL_URL: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
    RENT_URL: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
    MAX_RETRIES: 5,
    INITIAL_DELAY: 1000, // 1초
    MAX_DELAY: 32000, // 32초
    RATE_LIMIT_DELAY: 200, // 분당 300회 제한 대응 (0.2초)
    NUM_OF_ROWS: 100,
};

/**
 * 지연 함수
 * @param {number} ms - 대기 시간 (밀리초)
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 지수 백오프 계산
 * @param {number} attempt - 시도 횟수 (0부터 시작)
 * @returns {number} 대기 시간 (밀리초)
 */
function getBackoffDelay(attempt) {
    const baseDelay = API_CONFIG.INITIAL_DELAY * Math.pow(2, attempt);
    // 지터 추가 (0~500ms 랜덤)
    const jitter = Math.random() * 500;
    return Math.min(baseDelay + jitter, API_CONFIG.MAX_DELAY);
}

/**
 * API 호출 with 재시도 로직
 * @param {string} url - API URL
 * @param {object} params - 쿼리 파라미터
 * @returns {Promise<object>} API 응답 데이터
 */
export async function fetchWithRetry(url, params) {
    let lastError;

    for (let attempt = 0; attempt < API_CONFIG.MAX_RETRIES; attempt++) {
        try {
            // Rate limit 대응
            await delay(API_CONFIG.RATE_LIMIT_DELAY);

            const response = await axios.get(url, {
                params,
                timeout: 30000, // 30초 타임아웃
                responseType: 'text',
            });

            // JSON 파싱
            let data;
            try {
                data = JSON.parse(response.data);
            } catch (e) {
                // XML 응답일 수 있음 - 에러 처리
                throw new Error('응답 파싱 실패: JSON이 아닌 응답');
            }

            // API 에러 체크 (정상 코드: '00', '000')
            const resultCode = data.response?.header?.resultCode;
            if (resultCode && resultCode !== '00' && resultCode !== '000') {
                const resultMsg = data.response?.header?.resultMsg || '알 수 없는 에러';
                throw new Error(`API 에러 (${resultCode}): ${resultMsg}`);
            }

            return data;

        } catch (error) {
            lastError = error;

            // 429 (Rate Limit) 에러는 더 오래 대기
            if (error.response?.status === 429) {
                log(`⚠️ Rate Limit 초과, 60초 대기...`);
                await delay(60000);
                continue;
            }

            // 재시도 가능한 에러인지 확인
            const isRetryable =
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.response?.status >= 500 ||
                error.message.includes('timeout');

            if (isRetryable && attempt < API_CONFIG.MAX_RETRIES - 1) {
                const backoffDelay = getBackoffDelay(attempt);
                log(`⚠️ 재시도 ${attempt + 1}/${API_CONFIG.MAX_RETRIES}, ${backoffDelay}ms 후...`);
                await delay(backoffDelay);
            } else if (!isRetryable) {
                // 재시도 불가능한 에러는 즉시 throw
                throw error;
            }
        }
    }

    throw lastError;
}

/**
 * 아파트 매매 실거래가 조회
 * @param {string} lawdCd - 법정동 코드 (앞 5자리)
 * @param {string} dealYmd - 계약년월 (YYYYMM)
 * @param {string} serviceKey - API 서비스 키
 * @returns {Promise<Array>} 거래 데이터 배열
 */
export async function fetchAptDeals(lawdCd, dealYmd, serviceKey) {
    const allDeals = [];
    let pageNo = 1;

    while (true) {
        const params = {
            serviceKey,
            LAWD_CD: lawdCd,
            DEAL_YMD: dealYmd,
            numOfRows: API_CONFIG.NUM_OF_ROWS,
            pageNo,
        };

        const data = await fetchWithRetry(API_CONFIG.DEAL_URL, params);

        const items = data.response?.body?.items?.item || [];
        const deals = Array.isArray(items) ? items : items ? [items] : [];

        if (deals.length === 0) break;

        allDeals.push(...deals);

        // 마지막 페이지 체크
        if (deals.length < API_CONFIG.NUM_OF_ROWS) break;

        pageNo++;

        // 안전장치: 너무 많은 페이지 방지 (최대 100페이지 = 10,000건)
        if (pageNo > 100) {
            logError(`⚠️ 페이지 수 초과: ${lawdCd}, ${dealYmd}`);
            break;
        }
    }

    return allDeals;
}

/**
 * 아파트 전월세 실거래가 조회
 * @param {string} lawdCd - 법정동 코드 (앞 5자리)
 * @param {string} dealYmd - 계약년월 (YYYYMM)
 * @param {string} serviceKey - API 서비스 키
 * @returns {Promise<Array>} 거래 데이터 배열
 */
export async function fetchAptRents(lawdCd, dealYmd, serviceKey) {
    const allRents = [];
    let pageNo = 1;

    while (true) {
        const params = {
            serviceKey,
            LAWD_CD: lawdCd,
            DEAL_YMD: dealYmd,
            numOfRows: API_CONFIG.NUM_OF_ROWS,
            pageNo,
        };

        const data = await fetchWithRetry(API_CONFIG.RENT_URL, params);

        const items = data.response?.body?.items?.item || [];
        const rents = Array.isArray(items) ? items : items ? [items] : [];

        if (rents.length === 0) break;

        allRents.push(...rents);

        // 마지막 페이지 체크
        if (rents.length < API_CONFIG.NUM_OF_ROWS) break;

        pageNo++;

        // 안전장치: 너무 많은 페이지 방지
        if (pageNo > 100) {
            logError(`⚠️ 페이지 수 초과: ${lawdCd}, ${dealYmd}`);
            break;
        }
    }

    return allRents;
}

/**
 * API 총 건수만 빠르게 조회 (검증용)
 * @param {string} url - API URL
 * @param {string} lawdCd - 법정동 코드
 * @param {string} dealYmd - 계약년월
 * @param {string} serviceKey - API 서비스 키
 * @returns {Promise<number>} 총 건수
 */
export async function getAPITotalCount(url, lawdCd, dealYmd, serviceKey) {
    const params = {
        serviceKey,
        LAWD_CD: lawdCd,
        DEAL_YMD: dealYmd,
        numOfRows: 1,
        pageNo: 1,
    };

    const data = await fetchWithRetry(url, params);
    return data.response?.body?.totalCount || 0;
}

export { API_CONFIG };
