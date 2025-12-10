/**
 * 데이터베이스 연결 유틸리티
 * MySQL 연결 풀 및 쿼리 실행 함수 제공
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

// 환경 변수 검증
const requiredEnvVars = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ 환경 변수 ${envVar}가 설정되지 않았습니다.`);
        process.exit(1);
    }
}

// MySQL 연결 풀 생성
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5, // 10 -> 5로 축소 (안정성)
    queueLimit: 0,
    charset: 'utf8mb4', // 소문자로 변경
    timezone: '+09:00', // 한국 시간
    multipleStatements: true,
    // 연결 유지 설정 (Connection lost 방지)
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000, // 10초마다 연결 상태 확인
    connectTimeout: 60000, // 연결 타임아웃 60초
    maxIdle: 5, // 최대 유휴 연결 수
    idleTimeout: 60000, // 유휴 연결 타임아웃 60초
});

// 모든 연결에서 charset 강제 설정 (인코딩 오류 방지)
pool.on('connection', (connection) => {
    connection.query('SET NAMES utf8mb4');
    connection.query('SET CHARACTER SET utf8mb4');
    connection.query("SET SESSION collation_connection = 'utf8mb4_unicode_ci'");
});

/**
 * 쿼리 실행 함수
 * @param {string} query - SQL 쿼리
 * @param {Array} params - 파라미터 배열
 * @returns {Promise<Array>} 쿼리 결과
 */
export async function executeQuery(query, params = []) {
    const connection = await pool.getConnection();
    try {
        // execute 대신 query 사용 (prepared statement 인코딩 문제 회피)
        const [rows] = await connection.query(query, params);
        return rows;
    } catch (error) {
        console.error('쿼리 실행 오류:', error.message);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * 트랜잭션 실행 함수
 * @param {Function} callback - 트랜잭션 내에서 실행할 콜백 함수
 * @returns {Promise<any>} 콜백 함수의 반환값
 */
export async function executeTransaction(callback) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * 배치 INSERT (대량 데이터 효율적 삽입)
 * @param {string} table - 테이블명
 * @param {Array<string>} columns - 컬럼명 배열
 * @param {Array<Array>} values - 값 배열의 배열
 * @param {string} onDuplicateUpdate - ON DUPLICATE KEY UPDATE 절 (선택)
 * @returns {Promise<object>} INSERT 결과
 */
export async function batchInsert(table, columns, values, onDuplicateUpdate = '') {
    if (values.length === 0) return { affectedRows: 0 };

    const placeholders = values.map(
        () => `(${columns.map(() => '?').join(', ')})`
    ).join(', ');

    const flatValues = values.flat();

    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;

    if (onDuplicateUpdate) {
        query += ` ON DUPLICATE KEY UPDATE ${onDuplicateUpdate}`;
    }

    const [result] = await pool.execute(query, flatValues);
    return result;
}

/**
 * 연결 테스트
 * @returns {Promise<boolean>} 연결 성공 여부
 */
export async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL 연결 성공!');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ MySQL 연결 실패:', error.message);
        return false;
    }
}

/**
 * 연결 종료
 */
export async function closeConnection() {
    await pool.end();
    console.log('🔌 MySQL 연결 종료');
}

export default pool;
