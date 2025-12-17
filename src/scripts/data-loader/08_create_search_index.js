/**
 * 검색 인덱스 테이블 생성 및 데이터 populate
 * apt_deal_info에서 고유 아파트명+지역을 추출하여 빠른 검색용 테이블 생성
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';

async function createSearchIndex() {
    console.log('=== 검색 인덱스 테이블 생성 시작 ===\n');

    // 연결 테스트
    const connected = await testConnection();
    if (!connected) {
        console.error('DB 연결 실패. 종료합니다.');
        process.exit(1);
    }

    try {
        // 1. 테이블 생성
        console.log('1. 테이블 생성 중...');
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS apt_search_index (
                id INT AUTO_INCREMENT PRIMARY KEY,
                aptNm VARCHAR(100) NOT NULL,
                umdNm VARCHAR(50) NOT NULL,
                sggCd VARCHAR(10) NOT NULL,
                sido VARCHAR(50),
                sigungu VARCHAR(50),
                dealCount INT DEFAULT 0,
                lastDealDate DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_apt_region (aptNm, umdNm, sggCd),
                INDEX idx_aptNm (aptNm),
                INDEX idx_dealCount (dealCount DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('   테이블 생성 완료\n');

        // 2. 기존 데이터 삭제 (재생성 시)
        console.log('2. 기존 데이터 초기화 중...');
        await executeQuery('TRUNCATE TABLE apt_search_index');
        console.log('   초기화 완료\n');

        // 3. 데이터 populate
        console.log('3. 데이터 집계 및 삽입 중... (시간이 걸릴 수 있습니다)');
        const startTime = Date.now();

        const result = await executeQuery(`
            INSERT INTO apt_search_index (aptNm, umdNm, sggCd, sido, sigungu, dealCount, lastDealDate)
            SELECT 
                d.aptNm,
                d.umdNm,
                d.sggCd,
                l.as1 as sido,
                l.as2 as sigungu,
                COUNT(*) as dealCount,
                MAX(DATE(d.dealDate)) as lastDealDate
            FROM apt_deal_info d
            JOIN (
                SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2
                FROM apt_list
            ) l ON d.sggCd = l.sggCode
            WHERE d.aptNm IS NOT NULL AND d.aptNm != ''
            GROUP BY d.aptNm, d.umdNm, d.sggCd, l.as1, l.as2
        `);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`   삽입 완료: ${result.affectedRows}개 행 (${elapsed}초)\n`);

        // 4. FULLTEXT 인덱스 추가 (별도로 추가해야 함)
        console.log('4. FULLTEXT 인덱스 추가 중...');
        try {
            await executeQuery('ALTER TABLE apt_search_index ADD FULLTEXT INDEX ft_aptNm (aptNm)');
            console.log('   FULLTEXT 인덱스 추가 완료\n');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   FULLTEXT 인덱스 이미 존재\n');
            } else {
                throw e;
            }
        }

        // 5. 통계 확인
        console.log('5. 통계 확인:');
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT sido) as sido_count,
                COUNT(DISTINCT sigungu) as sigungu_count,
                SUM(dealCount) as total_deals,
                MAX(dealCount) as max_deals
            FROM apt_search_index
        `);
        console.log(`   총 항목: ${stats[0].total.toLocaleString()}개`);
        console.log(`   시도 수: ${stats[0].sido_count}개`);
        console.log(`   시군구 수: ${stats[0].sigungu_count}개`);
        console.log(`   총 거래 건수: ${stats[0].total_deals?.toLocaleString() || 0}건`);
        console.log(`   최대 거래 건수: ${stats[0].max_deals?.toLocaleString() || 0}건\n`);

        // 6. 샘플 데이터 확인
        console.log('6. 샘플 데이터 (거래 건수 상위 5개):');
        const samples = await executeQuery(`
            SELECT aptNm, umdNm, sido, sigungu, dealCount
            FROM apt_search_index
            ORDER BY dealCount DESC
            LIMIT 5
        `);
        samples.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.sido} ${row.sigungu} ${row.umdNm} ${row.aptNm} (${row.dealCount}건)`);
        });

        console.log('\n=== 검색 인덱스 테이블 생성 완료! ===');

    } catch (error) {
        console.error('오류 발생:', error);
        throw error;
    } finally {
        await closeConnection();
    }
}

createSearchIndex().catch(console.error);
