import mysql from 'mysql2/promise';

// 환경 변수 검증
if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
  throw new Error('MySQL 환경 변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
}

// MySQL 연결 풀 생성
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// 연결 테스트 함수
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL 연결 성공!');
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL 연결 실패:', error);
    return false;
  }
}

// 쿼리 실행 함수
export async function executeQuery(query, params) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('쿼리 실행 오류:', error);
    throw error;
  }
}

// 트랜잭션 실행 함수
export async function executeTransaction(queries) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute(query, params);
      results.push(result);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default pool; 