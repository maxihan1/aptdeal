import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

async function testMySQLConnection() {
  console.log('MySQL 연결 테스트 시작...');
  
  // 연결 설정
  const connectionConfig = {
    host: process.env.MYSQL_HOST || 'mf27af89599f7400796e2aee79f112315.apppaas.app',
    port: parseInt(process.env.MYSQL_PORT || '30047'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Qlxmtptkd!2',
    database: process.env.MYSQL_DATABASE || 'aptdeal',
    charset: 'utf8mb4',
  };

  console.log('연결 설정:', {
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    database: connectionConfig.database,
  });

  try {
    // 연결 생성
    const connection = await mysql.createConnection(connectionConfig);
    console.log('✅ MySQL 연결 성공!');

    // 데이터베이스 목록 조회
    const [databases] = await connection.execute('SHOW DATABASES');
    console.log('📋 사용 가능한 데이터베이스:');
    databases.forEach(db => {
      console.log(`  - ${db.Database}`);
    });

    // 테이블 목록 조회 (aptdeal 데이터베이스가 있는 경우)
    try {
      await connection.execute('USE aptdeal');
      const [tables] = await connection.execute('SHOW TABLES');
      console.log('📋 aptdeal 데이터베이스의 테이블:');
      if (tables.length === 0) {
        console.log('  - 테이블이 없습니다. 테이블을 생성해야 합니다.');
      } else {
        tables.forEach(table => {
          console.log(`  - ${Object.values(table)[0]}`);
        });
      }
    } catch (error) {
      console.log('⚠️ aptdeal 데이터베이스가 없습니다. 테이블 생성 스크립트를 실행해야 합니다.');
    }

    // 연결 종료
    await connection.end();
    console.log('✅ 연결 테스트 완료!');

  } catch (error) {
    console.error('❌ MySQL 연결 실패:', error.message);
    console.error('상세 오류:', error);
    
    // 환경 변수 확인
    console.log('\n🔍 환경 변수 확인:');
    console.log('MYSQL_HOST:', process.env.MYSQL_HOST || '기본값 사용');
    console.log('MYSQL_PORT:', process.env.MYSQL_PORT || '기본값 사용');
    console.log('MYSQL_USER:', process.env.MYSQL_USER || '기본값 사용');
    console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE || '기본값 사용');
  }
}

// 스크립트 실행
testMySQLConnection(); 