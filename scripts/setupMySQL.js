import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

async function setupMySQL() {
  console.log('MySQL 테이블 설정 시작...');
  
  // 연결 설정
  const connectionConfig = {
    host: process.env.MYSQL_HOST || 'mf27af89599f7400796e2aee79f112315.apppaas.app',
    port: parseInt(process.env.MYSQL_PORT || '30047'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Qlxmtptkd!2',
    charset: 'utf8mb4',
  };

  try {
    // 연결 생성 (데이터베이스 지정하지 않음)
    const connection = await mysql.createConnection(connectionConfig);
    console.log('✅ MySQL 연결 성공!');

    // SQL 파일 읽기
    const sqlFilePath = path.join(process.cwd(), 'scripts', 'createAptTableMySQL.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // SQL 문장들을 세미콜론으로 분리
    const sqlStatements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📋 ${sqlStatements.length}개의 SQL 문장을 실행합니다...`);

    // 각 SQL 문장 실행
    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i];
      if (statement.trim()) {
        try {
          console.log(`실행 중 (${i + 1}/${sqlStatements.length}): ${statement.substring(0, 50)}...`);
          await connection.execute(statement);
          console.log(`✅ 문장 ${i + 1} 실행 완료`);
        } catch (error) {
          console.error(`❌ 문장 ${i + 1} 실행 실패:`, error.message);
          // 계속 진행 (이미 존재하는 테이블 등의 오류는 무시)
        }
      }
    }

    // 테이블 생성 확인
    await connection.execute('USE aptdeal');
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\n📋 생성된 테이블:');
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });

    // 연결 종료
    await connection.end();
    console.log('\n✅ MySQL 테이블 설정 완료!');

  } catch (error) {
    console.error('❌ MySQL 설정 실패:', error.message);
    console.error('상세 오류:', error);
  }
}

// 스크립트 실행
setupMySQL(); 