// /Users/maxi.moff/APT value/web/scripts/clear_apt_rent_data.js
// apt_rent_info 테이블의 모든 데이터를 삭제하는 스크립트

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import mysql from 'mysql2/promise';

// 환경 변수 로드
const DB_HOST = process.env.MYSQL_HOST;
const DB_USER = process.env.MYSQL_USER;
const DB_PASSWORD = process.env.MYSQL_PASSWORD;
const DB_DATABASE = process.env.MYSQL_DATABASE;
const DB_PORT = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306;

console.log('=== 아파트 전월세 데이터 삭제 스크립트 ===');
console.log('환경 변수 확인:');
console.log('MYSQL_HOST:', process.env.MYSQL_HOST);
console.log('MYSQL_USER:', process.env.MYSQL_USER);
console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE);

async function clearAptRentData() {
    let connection = null;
    
    try {
        // DB 연결
        const pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_DATABASE,
            port: DB_PORT,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        connection = await pool.getConnection();
        console.log('데이터베이스 연결 성공');

        // 현재 데이터 수 확인
        const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM apt_rent_info');
        const currentCount = countResult[0].count;
        console.log(`현재 apt_rent_info 테이블 데이터 수: ${currentCount}개`);

        if (currentCount === 0) {
            console.log('삭제할 데이터가 없습니다.');
            return;
        }

        // 사용자 확인
        console.log('\n⚠️  경고: 이 작업은 되돌릴 수 없습니다!');
        console.log(`apt_rent_info 테이블의 모든 데이터 (${currentCount}개)를 삭제합니다.`);
        
        // 실제 삭제 실행
        console.log('\n데이터 삭제 중...');
        const [deleteResult] = await connection.execute('DELETE FROM apt_rent_info');
        
        console.log(`✅ 삭제 완료: ${deleteResult.affectedRows}개 데이터 삭제됨`);
        
        // 삭제 후 데이터 수 확인
        const [finalCountResult] = await connection.execute('SELECT COUNT(*) as count FROM apt_rent_info');
        const finalCount = finalCountResult[0].count;
        console.log(`삭제 후 apt_rent_info 테이블 데이터 수: ${finalCount}개`);

    } catch (error) {
        console.error('❌ 데이터 삭제 중 오류 발생:', error.message);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// 스크립트 실행
clearAptRentData()
    .then(() => {
        console.log('\n=== 데이터 삭제 완료 ===');
        console.log('이제 apt_rent_info_table.js를 실행하여 새로운 데이터를 수집할 수 있습니다.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n=== 데이터 삭제 실패 ===');
        console.error(error);
        process.exit(1);
    });
