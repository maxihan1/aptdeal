// /Users/maxi.moff/APT value/web/scripts/apt_detail_info_table.js (ES Modules 버전)
//
// 사용법:
//   node apt_detail_info_table.js [시작인덱스] [배치크기] [기존데이터건너뛰기]
//
// 매개변수:
//   - 시작인덱스: apt_list 테이블에서 시작할 인덱스 (기본값: 0)
//   - 배치크기: 한 번에 처리할 kaptCode 개수 (기본값: 100)
//   - 기존데이터건너뛰기: 'true'로 설정하면 이미 처리된 kaptCode를 건너뜀 (기본값: false)
//
// 예시:
//   node apt_detail_info_table.js                    # 처음 100개 처리
//   node apt_detail_info_table.js 100                # 100번째부터 100개 처리
//   node apt_detail_info_table.js 100 50             # 100번째부터 50개 처리
//   node apt_detail_info_table.js 100 50 true        # 100번째부터 50개 처리, 기존 데이터 건너뛰기
//
// 중간에 끊어진 경우 이어서 처리:
//   node apt_detail_info_table.js 0 1000 true        # 처음부터 1000개 처리, 기존 데이터 건너뛰기

// dotenv 로드
import dotenv from 'dotenv';
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

const APT_DETAIL_INFO_API_BASE_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4';

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

async function ingestAptDetailInfoData() {
    if (!API_KEY) {
        console.error('오류: SERVICE_KEY가 환경 변수에 설정되어 있지 않습니다. .env 파일을 확인해주세요.');
        process.exit(1);
    }

    const startIndex = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
    const batchSize = process.argv[3] ? parseInt(process.argv[3], 10) : 100;
    const skipExisting = process.argv[4] === 'true'; // 네 번째 인수로 기존 데이터 건너뛰기 옵션
    
    if (isNaN(startIndex) || startIndex < 0) {
        console.error('오류: 시작 인덱스가 유효하지 않습니다. 0 이상의 숫자로 입력해주세요.');
        process.exit(1);
    }
    
    if (isNaN(batchSize) || batchSize < 1) {
        console.error('오류: 배치 크기가 유효하지 않습니다. 1 이상의 숫자로 입력해주세요.');
        process.exit(1);
    }

    let connection = null;
    try {
        const dbPool = await getDbConnectionPool();
        connection = await dbPool.getConnection();

        // 이미 처리된 kaptCode 목록 조회
        console.log('\n--- 이미 처리된 kaptCode 확인 중 ---');
        const [existingCodes] = await connection.execute(
            'SELECT kaptCode FROM apt_detail_info'
        );
        const existingKaptCodes = new Set(existingCodes.map(row => row.kaptCode));
        console.log(`이미 처리된 kaptCode: ${existingKaptCodes.size}개`);

        // apt_list 테이블에서 kaptCode 목록 조회
        console.log(`\n--- apt_list 테이블에서 kaptCode 목록 조회 중 (시작: ${startIndex}, 크기: ${batchSize}) ---`);
        console.log('쿼리 매개변수:', { startIndex: Number(startIndex), batchSize: Number(batchSize) });
        
        const [allKaptCodes] = await connection.execute(
            `SELECT kaptCode FROM apt_list LIMIT ${Number(startIndex)}, ${Number(batchSize)}`
        );

        if (allKaptCodes.length === 0) {
            console.log('처리할 kaptCode가 없습니다.');
            return;
        }

        // 기존 데이터 건너뛰기 옵션이 활성화된 경우 필터링
        let kaptCodes = allKaptCodes;
        if (skipExisting) {
            kaptCodes = allKaptCodes.filter(row => !existingKaptCodes.has(row.kaptCode));
            console.log(`필터링 후 처리할 kaptCode: ${kaptCodes.length}개 (기존 ${allKaptCodes.length - kaptCodes.length}개 건너뜀)`);
        } else {
            console.log(`총 ${kaptCodes.length}개의 kaptCode를 처리합니다.`);
        }

        if (kaptCodes.length === 0) {
            console.log('처리할 새로운 kaptCode가 없습니다.');
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        let skipCount = 0;
        let batchErrors = [];

        for (let i = 0; i < kaptCodes.length; i++) {
            const kaptCode = kaptCodes[i].kaptCode;
            
            // 기존 데이터 건너뛰기 옵션이 비활성화된 경우에도 개별 확인
            if (!skipExisting && existingKaptCodes.has(kaptCode)) {
                console.log(`  ⏭️ ${kaptCode}: 이미 처리됨 (건너뜀)`);
                skipCount++;
                continue;
            }
            
            const apiUrl = `${APT_DETAIL_INFO_API_BASE_URL}?serviceKey=${API_KEY}&kaptCode=${kaptCode}`;
            
            console.log(`\n--- ${i + 1}/${kaptCodes.length} 처리 중: ${kaptCode} ---`);
            console.log(`API URL: ${apiUrl}`);

            try {
                const response = await axios.get(apiUrl);
                
                // API 응답 확인
                if (response.status !== 200) {
                    throw new Error(`API 응답 오류: ${response.status}`);
                }

                const data = response.data;
                
                // 응답 구조 확인
                if (!data.response?.body?.item) {
                    console.log(`  ${kaptCode}: 응답에 item이 없습니다.`);
                    errorCount++;
                    continue;
                }

                const item = data.response.body.item;
                
                // 데이터베이스에 삽입
                const [result] = await connection.execute(
                    `INSERT IGNORE INTO apt_detail_info (
                        kaptCode, kaptName, codeMgr, kaptMgrCnt, kaptCcompany,
                        codeSec, kaptdScnt, kaptdSecCom, codeClean, kaptdClcnt,
                        codeGarbage, codeDisinf, kaptdDcnt, disposalType, codeStr,
                        kaptdEcapa, codeEcon, codeEmgr, codeFalarm, codeWsupply,
                        codeElev, kaptdEcnt, kaptdPcnt, kaptdPcntu, codeNet,
                        kaptdCccnt, welfareFacility, kaptdWtimebus, subwayLine,
                        subwayStation, kaptdWtimesub, convenientFacility, educationFacility,
                        groundElChargerCnt, undergroundElChargerCnt, useYn
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.kaptCode,
                        item.kaptName,
                        item.codeMgr,
                        item.kaptMgrCnt,
                        item.kaptCcompany,
                        item.codeSec,
                        item.kaptdScnt,
                        item.kaptdSecCom,
                        item.codeClean,
                        item.kaptdClcnt,
                        item.codeGarbage,
                        item.codeDisinf,
                        item.kaptdDcnt,
                        item.disposalType,
                        item.codeStr,
                        item.kaptdEcapa,
                        item.codeEcon,
                        item.codeEmgr,
                        item.codeFalarm,
                        item.codeWsupply,
                        item.codeElev,
                        item.kaptdEcnt,
                        item.kaptdPcnt,
                        item.kaptdPcntu,
                        item.codeNet,
                        item.kaptdCccnt,
                        item.welfareFacility,
                        item.kaptdWtimebus,
                        item.subwayLine,
                        item.subwayStation,
                        item.kaptdWtimesub,
                        item.convenientFacility,
                        item.educationFacility,
                        item.groundElChargerCnt,
                        item.undergroundElChargerCnt,
                        item.useYn
                    ]
                );

                if (result.affectedRows > 0) {
                    successCount++;
                    console.log(`  ✅ ${kaptCode} (${item.kaptName}): 성공적으로 삽입됨`);
                } else {
                    console.log(`  ⚠️ ${kaptCode} (${item.kaptName}): 이미 존재함 (IGNORE)`);
                }

            } catch (error) {
                console.error(`  ❌ ${kaptCode} 처리 중 오류:`, error.message);
                errorCount++;
                batchErrors.push(`${kaptCode}: ${error.message}`);
            }

            // API 호출 간격 조절 (서버 부하 방지)
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`\n--- 데이터 적재 완료 ---`);
        console.log(`총 처리된 항목: ${kaptCodes.length}`);
        console.log(`성공: ${successCount}개`);
        console.log(`오류: ${errorCount}개`);
        console.log(`건너뜀: ${skipCount}개`);
        if (batchErrors.length > 0) {
            console.warn(`발생한 오류 목록 (${batchErrors.length}개):`);
            batchErrors.forEach(err => console.warn(`- ${err}`));
        }
        console.log('아파트 상세 정보 적재 스크립트가 완료되었습니다.');

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
        console.error('아파트 상세 정보 적재 스크립트가 실패했습니다.');
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
            console.log('데이터베이스 연결 풀이 종료되었습니다.');
        }
    }
}

// 스크립트 실행 함수 호출
ingestAptDetailInfoData();
