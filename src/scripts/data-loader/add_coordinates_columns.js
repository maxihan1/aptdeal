/**
 * apt_basic_info 테이블에 좌표 컬럼 추가 마이그레이션 스크립트
 * latitude, longitude 컬럼 및 인덱스 추가
 */

import { executeQuery, closeConnection, testConnection } from './utils/db.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function addCoordinatesColumns() {
    console.log('🗺️ apt_basic_info 테이블에 좌표 컬럼 추가 시작...\n');

    // 1. 연결 테스트
    const connected = await testConnection();
    if (!connected) {
        console.error('❌ DB 연결 실패');
        process.exit(1);
    }

    try {
        // 2. 기존 컬럼 확인
        console.log('📋 기존 테이블 구조 확인 중...');
        const columns = await executeQuery(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'apt_basic_info'
            AND COLUMN_NAME IN ('latitude', 'longitude')
        `);

        if (columns.length > 0) {
            console.log('⚠️ latitude/longitude 컬럼이 이미 존재합니다.');
            console.log('   기존 컬럼:', columns.map(c => c.COLUMN_NAME).join(', '));

            // 현재 좌표 데이터 통계 출력
            const stats = await executeQuery(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) as with_coords,
                    SUM(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 ELSE 0 END) as without_coords
                FROM apt_basic_info
            `);

            console.log('\n📊 현재 좌표 데이터 현황:');
            console.log(`   총 아파트: ${stats[0].total}개`);
            console.log(`   좌표 있음: ${stats[0].with_coords}개`);
            console.log(`   좌표 없음: ${stats[0].without_coords}개`);

            await closeConnection();
            return;
        }

        // 3. 컬럼 추가
        console.log('\n➕ latitude, longitude 컬럼 추가 중...');

        await executeQuery(`
            ALTER TABLE apt_basic_info 
            ADD COLUMN latitude DECIMAL(10, 8) NULL COMMENT '위도' AFTER kaptAddr,
            ADD COLUMN longitude DECIMAL(11, 8) NULL COMMENT '경도' AFTER latitude
        `);
        console.log('✅ 컬럼 추가 완료');

        // 4. 인덱스 추가
        console.log('🔍 좌표 인덱스 추가 중...');
        await executeQuery(`
            ALTER TABLE apt_basic_info
            ADD INDEX idx_coordinates (latitude, longitude)
        `);
        console.log('✅ 인덱스 추가 완료');

        // 5. 결과 확인
        console.log('\n📋 변경된 테이블 구조:');
        const newColumns = await executeQuery(`
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'apt_basic_info'
            ORDER BY ORDINAL_POSITION
        `);

        console.table(newColumns.map(c => ({
            컬럼: c.COLUMN_NAME,
            타입: c.COLUMN_TYPE,
            Null: c.IS_NULLABLE,
            설명: c.COLUMN_COMMENT || '-'
        })));

        console.log('\n✅ 마이그레이션 완료!');
        console.log('📝 다음 단계: node src/scripts/data-loader/fetch_coordinates.js 실행\n');

    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }
}

addCoordinatesColumns().catch(console.error);
