import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

async function testMySQLConnection() {
  console.log('MySQL 연결 테스트 시작...');
  
  // 연결 설정 (데이터베이스 없이)
  const connectionConfig = {
    host: process.env.MYSQL_HOST || 'mf27af89599f7400796e2aee79f112315.apppaas.app',
    port: parseInt(process.env.MYSQL_PORT || '30047'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Qlxmtptkd!2',
    charset: 'utf8mb4',
  };

  console.log('연결 설정:', {
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
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

    // aptdeal 데이터베이스가 있는지 확인
    const aptdealExists = databases.some(db => db.Database === 'aptdeal');
    
    if (aptdealExists) {
      console.log('✅ aptdeal 데이터베이스가 존재합니다!');
      
      // aptdeal 데이터베이스의 테이블 목록 조회
      const [tables] = await connection.execute('SHOW TABLES FROM aptdeal');
      console.log('📋 aptdeal 데이터베이스의 테이블:');
      if (tables.length === 0) {
        console.log('  - 테이블이 없습니다. 테이블을 생성해야 합니다.');
      } else {
        tables.forEach(table => {
          console.log(`  - ${Object.values(table)[0]}`);
        });
        
        // 각 테이블의 레코드 수 확인
        console.log('\n📊 테이블별 레코드 수:');
        for (const table of tables) {
          const tableName = Object.values(table)[0];
          try {
            const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM aptdeal.${tableName}`);
            console.log(`  - ${tableName}: ${countResult[0].count}개 레코드`);
          } catch (error) {
            console.log(`  - ${tableName}: 확인 실패 (${error.message})`);
          }
        }
      }
    } else {
      console.log('⚠️ aptdeal 데이터베이스가 없습니다. 데이터베이스를 생성해야 합니다.');
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