import mysql from 'mysql2/promise';

// MySQL 연결 풀 생성
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mf27af89599f7400796e2aee79f112315.apppaas.app',
  port: parseInt(process.env.MYSQL_PORT || '30047'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'Qlxmtptkd!2',
  database: process.env.MYSQL_DATABASE || 'aptdeal',
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
export async function executeQuery(query: string, params?: (string | number)[]) {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('쿼리 실행 오류:', error);
    throw error;
  }
}

// 트랜잭션 실행 함수
export async function executeTransaction(queries: { query: string; params?: (string | number)[] }[]) {
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