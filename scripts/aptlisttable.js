// /Users/maxi.moff/APT value/web/scripts/aptlisttable.js (ES Modules 버전)

// dotenv 로드 방식 변경
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// 다른 모듈 로드 방식 변경
import mysql from 'mysql2/promise';
import axios from 'axios';

// 환경 변수 로드 (MySQL 환경 변수명에 맞게 수정)
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

const APT_LIST_API_BASE_URL = 'https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3';

// XML 파서 설정 (동일)
// const xmlParser = new XMLParser({
//     explicitArray: false,
//     trim: true,
//     explicitRoot: false,
// });

// DB 연결 풀 생성 (동일)
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

async function ingestAptListData() {
    if (!API_KEY) {
        console.error('오류: SERVICE_KEY가 환경 변수에 설정되어 있지 않습니다. .env 파일을 확인해주세요.');
        process.exit(1);
    }

    const startPage = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
    if (isNaN(startPage) || startPage < 1) {
        console.error('오류: 시작 페이지 번호가 유효하지 않습니다. 숫자로 입력하거나 1 이상이어야 합니다.');
        process.exit(1);
    }

    let connection = null;
    try {
        const dbPool = await getDbConnectionPool();
        connection = await dbPool.getConnection();

        const checkUrl = `${APT_LIST_API_BASE_URL}?serviceKey=${API_KEY}&pageNo=1&numOfRows=1`;
        console.log(`\n--- 전체 항목 개수를 확인 중: ${checkUrl} ---`);
        const checkResponse = await axios.get(checkUrl);
        
        // API 응답 확인
        console.log('API 응답 상태:', checkResponse.status);
        console.log('API 응답 헤더:', checkResponse.headers['content-type']);
        console.log('API 응답 데이터 타입:', typeof checkResponse.data);
        console.log('API 응답 데이터:', JSON.stringify(checkResponse.data).substring(0, 200));
        
        // JSON 응답이므로 직접 파싱
        const checkData = checkResponse.data;

        const totalCount = parseInt(checkData.response.body.totalCount, 10);
        if (isNaN(totalCount)) {
            throw new Error('API 응답에서 totalCount를 파싱하는 데 실패했습니다.');
        }
        console.log(`가져올 공동주택 단지 총 개수: ${totalCount}`);

        const numOfRows = 1000;
        const totalPages = Math.ceil(totalCount / numOfRows);
        console.log(`가져올 전체 페이지 수: ${totalPages}`);
        console.log(`** 데이터 적재를 ${startPage} 페이지부터 시작합니다. **`);

        let insertedCount = 0;
        let batchErrors = [];

        for (let pageNo = startPage; pageNo <= totalPages; pageNo++) {
            const apiUrl = `${APT_LIST_API_BASE_URL}?serviceKey=${API_KEY}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
            console.log(`\n--- 페이지 ${pageNo}/${totalPages} 데이터 가져오는 중 ---`);
            console.log(`API URL: ${apiUrl}`);

            try {
                const response = await axios.get(apiUrl);
                const data = response.data; // JSON 파싱 제거

                // 디버깅: 페이지별 응답 데이터 확인
                console.log(`페이지 ${pageNo} 응답 데이터 구조:`, JSON.stringify(data).substring(0, 300));

                // 디버깅: items 경로 확인
                console.log(`페이지 ${pageNo} data.response:`, !!data.response);
                console.log(`페이지 ${pageNo} data.response.body:`, !!data.response?.body);
                console.log(`페이지 ${pageNo} data.response.body.items:`, !!data.response?.body?.items);
                console.log(`페이지 ${pageNo} data.response.body.items 길이:`, data.response?.body?.items?.length);

                const items = data.response.body.items;
                if (!items || items.length === 0) {
                    console.log(`페이지 ${pageNo}에서 가져올 항목이 없습니다.`);
                    continue;
                }

                // items가 이미 배열이므로 추가 변환 불필요
                const itemsArray = items;

                await connection.beginTransaction();

                for (const item of itemsArray) {
                    try {
                        const { kaptCode, kaptName, bjdCode, as1, as2, as3, as4 } = item;

                        const [result] = await connection.execute(
                            `INSERT IGNORE INTO apt_list (kaptCode, kaptName, bjdCode, as1, as2, as3, as4)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [kaptCode, kaptName, bjdCode, as1, as2, as3, as4 || null]
                        );

                        if (result.affectedRows > 0) {
                            insertedCount++;
                        }
                    } catch (itemErr) {
                        console.error(`  항목 삽입 중 오류 발생 (kaptCode: ${item.kaptCode || '알 수 없음'}):`, itemErr.message);
                        batchErrors.push(`페이지 ${pageNo}, 항목 ${item.kaptCode || '알 수 없음'}: ${itemErr.message}`);
                    }
                }
                await connection.commit();
                console.log(`페이지 ${pageNo} 처리 완료 및 커밋되었습니다.`);

            } catch (pageErr) {
                if (connection) {
                    await connection.rollback();
                }
                console.error(`페이지 ${pageNo} 가져오기 또는 처리 중 오류 발생:`, pageErr.message);
                batchErrors.push(`페이지 ${pageNo} 전체 오류: ${pageErr.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n--- 데이터 적재 완료 ---`);
        console.log(`총 처리된 항목: ${totalCount}`);
        console.log(`새로 삽입된/업데이트된 항목: ${insertedCount}`);
        if (batchErrors.length > 0) {
            console.warn(`발생한 오류 목록 (${batchErrors.length}개):`);
            batchErrors.forEach(err => console.warn(`- ${err}`));
        }
        console.log('데이터 적재 스크립트가 성공적으로 완료되었습니다.');

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
        console.error('데이터 적재 스크립트가 실패했습니다.');
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
            console.log('데이터베이스 연결 풀이 종료되었습니다.');
        }
    }
}

// 스크립트 실행 함수 호출
ingestAptListData();