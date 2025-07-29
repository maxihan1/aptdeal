// /Users/maxi.moff/APT value/web/scripts/apt_deal_info_table.js (ES Modules 버전)
//
// 사용법:
//   node apt_deal_info_table.js [시작지역인덱스] [시작년월] [종료년월] [배치크기]
//
// 매개변수:
//   - 시작지역인덱스: lawd_cd_map.json에서 시작할 지역 인덱스 (기본값: 0)
//   - 시작년월: YYYYMM 형식 (기본값: 201501)
//   - 종료년월: YYYYMM 형식 (기본값: 202507)
//   - 배치크기: 한 번에 처리할 지역 개수 (기본값: 10)
//
// 예시:
//   node apt_deal_info_table.js                    # 전체 처리
//   node apt_deal_info_table.js 100                # 100번째 지역부터 처리
//   node apt_deal_info_table.js 0 202401 202412    # 2024년 1월~12월만 처리
//   node apt_deal_info_table.js 50 202501 202507   # 50번째 지역부터 2025년 1월~7월 처리

// dotenv 로드
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: '../.env' });

// 모듈 로드
import mysql from 'mysql2/promise';
import axios from 'axios';

// 환경 변수 로드
const DB_HOST = process.env.MYSQL_HOST;
const DB_USER = process.env.MYSQL_USER;
const DB_PASSWORD = process.env.MYSQL_PASSWORD;
const DB_DATABASE = process.env.MYSQL_DATABASE;
const DB_PORT = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306;
const API_KEY = process.env.SERVICE_KEY;

// 디버깅을 위한 환경 변수 출력
console.log('환경 변수 확인:');
console.log('MYSQL_HOST:', process.env.MYSQL_HOST);
console.log('MYSQL_USER:', process.env.MYSQL_USER);
console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE);
console.log('SERVICE_KEY:', process.env.SERVICE_KEY ? '설정됨' : '설정되지 않음');

const APT_DEAL_API_BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// DB 연결 풀 생성
let pool = null;

async function getDbConnectionPool() {
    if (!pool) {
        if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_DATABASE) {
            console.error('오류: 데이터베이스 환경 변수(DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE)가 설정되지 않았습니다. .env 파일을 확인해주세요.');
            process.exit(1);
        }
        pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_DATABASE,
            port: DB_PORT,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        console.log('데이터베이스 연결 풀이 생성되었습니다.');
    }
    return pool;
}

// LAWD_CD 매핑 로드
function loadLawdCdMap() {
    try {
        const lawdCdMapPath = path.join(process.cwd(), '..', 'lawd_cd_map.json');
        const lawdCdMapData = fs.readFileSync(lawdCdMapPath, 'utf8');
        const lawdCdMap = JSON.parse(lawdCdMapData);
        
        // 매핑을 배열로 변환 (지역명, LAWD_CD)
        const regions = Object.entries(lawdCdMap).map(([regionName, lawdCd]) => ({
            name: regionName,
            lawdCd: lawdCd
        }));
        
        console.log(`LAWD_CD 매핑 로드 완료: ${regions.length}개 지역`);
        return regions;
    } catch (error) {
        console.error('lawd_cd_map.json 파일을 읽을 수 없습니다:', error.message);
        process.exit(1);
    }
}

// 년월 범위 생성
function generateYearMonthRange(startYearMonth, endYearMonth) {
    const months = [];
    const start = new Date(parseInt(startYearMonth.substring(0, 4)), parseInt(startYearMonth.substring(4, 6)) - 1, 1);
    const end = new Date(parseInt(endYearMonth.substring(0, 4)), parseInt(endYearMonth.substring(4, 6)) - 1, 1);
    
    let current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}${month}`);
        current.setMonth(current.getMonth() + 1);
    }
    
    return months;
}

// 이미 처리된 데이터 확인
async function getProcessedData(connection) {
    const [result] = await connection.execute(`
        SELECT DISTINCT CONCAT(sggCd, '_', dealYear, dealMonth) as region_month 
        FROM apt_deal_info
    `);
    return new Set(result.map(row => row.region_month));
}

// API에서 모든 페이지 데이터 가져오기
async function fetchAllPages(region, yearMonth) {
    const allItems = [];
    let pageNo = 1;
    const numOfRows = 1000; // 한 번에 최대 1000개씩 가져오기
    
    while (true) {
        const apiUrl = `${APT_DEAL_API_BASE_URL}?LAWD_CD=${region.lawdCd}&DEAL_YMD=${yearMonth}&numOfRows=${numOfRows}&pageNo=${pageNo}&serviceKey=${API_KEY}`;
        
        try {
            const response = await axios.get(apiUrl);
            
            if (response.status !== 200) {
                throw new Error(`API 응답 오류: ${response.status}`);
            }

            const data = response.data;
            
            // 응답 구조 확인
            if (!data.response?.body?.items?.item) {
                break; // 더 이상 데이터가 없음
            }

            const items = Array.isArray(data.response.body.items.item) 
                ? data.response.body.items.item 
                : [data.response.body.items.item];

            if (items.length === 0) {
                break; // 더 이상 데이터가 없음
            }

            allItems.push(...items);
            
            // 페이지 정보 확인
            const totalCount = data.response?.body?.totalCount || 0;
            if (allItems.length >= totalCount || items.length < numOfRows) {
                break; // 모든 데이터를 가져왔거나 마지막 페이지
            }
            
            pageNo++;
            
            // API 호출 간격 조절 (페이지 간)
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error(`    ❌ 페이지 ${pageNo} 처리 중 오류:`, error.message);
            break;
        }
    }
    
    return allItems;
}

// 데이터 적재
async function ingestAptDealData() {
    if (!API_KEY) {
        console.error('오류: SERVICE_KEY가 환경 변수에 설정되어 있지 않습니다. .env 파일을 확인해주세요.');
        process.exit(1);
    }

    const startRegionIndex = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
    const startYearMonth = process.argv[3] || '201501';
    const endYearMonth = process.argv[4] || '202507';
    const batchSize = process.argv[5] ? parseInt(process.argv[5], 10) : 10;

    console.log(`\n=== 아파트 실거래가 데이터 적재 시작 ===`);
    console.log(`시작 지역 인덱스: ${startRegionIndex}`);
    console.log(`기간: ${startYearMonth} ~ ${endYearMonth}`);
    console.log(`배치 크기: ${batchSize}`);

    // LAWD_CD 매핑 로드
    const regions = loadLawdCdMap();
    console.log(`총 지역 수: ${regions.length}`);

    // 년월 범위 생성
    const yearMonths = generateYearMonthRange(startYearMonth, endYearMonth);
    console.log(`처리할 년월 수: ${yearMonths.length}`);

    let connection = null;
    try {
        const dbPool = await getDbConnectionPool();
        connection = await dbPool.getConnection();

        // 이미 처리된 데이터 확인
        console.log('\n--- 이미 처리된 데이터 확인 중 ---');
        const processedData = await getProcessedData(connection);
        console.log(`이미 처리된 지역-월 조합: ${processedData.size}개`);

        let totalSuccessCount = 0;
        let totalErrorCount = 0;
        let totalSkipCount = 0;
        let batchErrors = [];

        // 지역별 처리
        for (let regionIndex = startRegionIndex; regionIndex < regions.length; regionIndex += batchSize) {
            const regionBatch = regions.slice(regionIndex, regionIndex + batchSize);
            console.log(`\n--- 지역 배치 처리 중: ${regionIndex + 1}~${Math.min(regionIndex + batchSize, regions.length)}/${regions.length} ---`);

            for (const region of regionBatch) {
                console.log(`\n--- 지역 처리 중: ${region.name} (${region.lawdCd}) ---`);

                for (const yearMonth of yearMonths) {
                    const regionMonthKey = `${region.lawdCd}_${yearMonth.substring(0, 4)}${yearMonth.substring(4, 6)}`;
                    
                    // 이미 처리된 데이터인지 확인
                    if (processedData.has(regionMonthKey)) {
                        console.log(`  ⏭️ ${yearMonth}: 이미 처리됨 (건너뜀)`);
                        totalSkipCount++;
                        continue;
                    }

                    console.log(`  📊 ${yearMonth} 데이터 가져오는 중...`);

                    try {
                        // 모든 페이지 데이터 가져오기
                        const items = await fetchAllPages(region, yearMonth);

                        if (items.length === 0) {
                            console.log(`    ${yearMonth}: 거래 데이터 없음`);
                            continue;
                        }

                        // 데이터베이스에 삽입
                        let insertCount = 0;
                        for (const item of items) {
                            try {
                                const [result] = await connection.execute(
                                    `INSERT IGNORE INTO apt_deal_info (
                                        aptDong, aptNm, buildYear, buyerGbn, cdealDay, cdealType,
                                        dealAmount, dealDay, dealMonth, dealYear, dealingGbn,
                                        estateAgentSggNm, excluUseAr, floor, jibun, landLeaseholdGbn,
                                        rgstDate, sggCd, slerGbn, umdNm
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        item.aptDong,
                                        item.aptNm,
                                        item.buildYear,
                                        item.buyerGbn,
                                        item.cdealDay,
                                        item.cdealType,
                                        item.dealAmount,
                                        item.dealDay,
                                        item.dealMonth,
                                        item.dealYear,
                                        item.dealingGbn,
                                        item.estateAgentSggNm,
                                        item.excluUseAr,
                                        item.floor,
                                        item.jibun,
                                        item.landLeaseholdGbn,
                                        item.rgstDate,
                                        item.sggCd,
                                        item.slerGbn,
                                        item.umdNm
                                    ]
                                );
                                
                                if (result.affectedRows > 0) {
                                    insertCount++;
                                }
                            } catch (insertError) {
                                console.error(`    ❌ 개별 데이터 삽입 오류:`, insertError.message);
                            }
                        }

                        if (insertCount > 0) {
                            totalSuccessCount++;
                            console.log(`    ✅ ${yearMonth}: ${insertCount}개 거래 데이터 삽입됨 (총 ${items.length}개 중)`);
                        } else {
                            console.log(`    ⚠️ ${yearMonth}: 이미 존재하는 데이터 (IGNORE)`);
                        }

                    } catch (error) {
                        console.error(`    ❌ ${yearMonth} 처리 중 오류:`, error.message);
                        totalErrorCount++;
                        batchErrors.push(`${region.name}(${region.lawdCd})_${yearMonth}: ${error.message}`);
                    }

                    // API 호출 간격 조절 (서버 부하 방지)
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 배치 완료 후 진행 상황 출력
            console.log(`\n--- 배치 완료 (${regionIndex + 1}~${Math.min(regionIndex + batchSize, regions.length)}/${regions.length}) ---`);
            console.log(`현재까지 성공: ${totalSuccessCount}개`);
            console.log(`현재까지 오류: ${totalErrorCount}개`);
            console.log(`현재까지 건너뜀: ${totalSkipCount}개`);
        }

        console.log(`\n=== 데이터 적재 완료 ===`);
        console.log(`총 성공: ${totalSuccessCount}개`);
        console.log(`총 오류: ${totalErrorCount}개`);
        console.log(`총 건너뜀: ${totalSkipCount}개`);
        
        if (batchErrors.length > 0) {
            console.warn(`\n발생한 오류 목록 (${batchErrors.length}개):`);
            batchErrors.slice(0, 20).forEach(err => console.warn(`- ${err}`));
            if (batchErrors.length > 20) {
                console.warn(`... 및 ${batchErrors.length - 20}개 더`);
            }
        }
        
        console.log('아파트 실거래가 데이터 적재 스크립트가 완료되었습니다.');

    } catch (error) {
        console.error('\n--- 전체 데이터 적재 중 치명적인 오류 발생 ---');
        console.error(error.message);
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error('롤백 중 오류 발생:', rollbackErr.message);
            }
        }
        console.error('아파트 실거래가 데이터 적재 스크립트가 실패했습니다.');
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
            console.log('데이터베이스 연결 풀이 종료되었습니다.');
        }
    }
}

// 스크립트 실행 함수 호출
ingestAptDealData();
