/**
 * 검색 인덱스에 최근 3개월 거래 건수 추가
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';

async function addRecentDealCount() {
    console.log('=== 최근 3개월 거래 건수 추가 ===\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('DB 연결 실패. 종료합니다.');
        process.exit(1);
    }

    try {
        // 1. 컬럼 추가
        console.log('1. recentDealCount 컬럼 추가 중...');
        try {
            await executeQuery('ALTER TABLE apt_search_index ADD COLUMN recentDealCount INT DEFAULT 0');
            console.log('   컬럼 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   컬럼 이미 존재');
            } else throw e;
        }

        // 2. 인덱스 추가
        console.log('2. 인덱스 추가 중...');
        try {
            await executeQuery('CREATE INDEX idx_recentDealCount ON apt_search_index(recentDealCount DESC)');
            console.log('   인덱스 추가됨');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   인덱스 이미 존재');
            } else throw e;
        }

        // 3. 최근 3개월 거래 건수 계산 및 업데이트
        console.log('3. 최근 3개월 거래 건수 계산 중...');
        const startTime = Date.now();

        // 3개월 전 날짜 계산
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const startDate = threeMonthsAgo.toISOString().slice(0, 10);

        console.log(`   기준 시작일: ${startDate}`);

        // 최근 3개월 거래 건수 집계
        const result = await executeQuery(`
            UPDATE apt_search_index s
            JOIN (
                SELECT 
                    aptNm,
                    umdNm,
                    sggCd,
                    COUNT(*) as cnt
                FROM apt_deal_info
                WHERE dealDate >= ?
                GROUP BY aptNm, umdNm, sggCd
            ) d ON s.aptNm = d.aptNm 
               AND s.umdNm = d.umdNm 
               AND s.sggCd = d.sggCd
            SET s.recentDealCount = d.cnt
        `, [startDate]);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   업데이트 완료: ${result.affectedRows}개 행 (${elapsed}초)`);

        // 4. 통계 확인
        console.log('\n4. 통계 확인:');
        const [stats] = await executeQuery(`
            SELECT 
                SUM(recentDealCount) as totalRecent,
                MAX(recentDealCount) as maxRecent,
                AVG(recentDealCount) as avgRecent,
                SUM(CASE WHEN recentDealCount > 0 THEN 1 ELSE 0 END) as withRecent
            FROM apt_search_index
        `);
        console.log(`   최근 3개월 총 거래: ${stats.totalRecent?.toLocaleString() || 0}건`);
        console.log(`   거래 있는 아파트: ${stats.withRecent?.toLocaleString() || 0}개`);
        console.log(`   최대 거래 건수: ${stats.maxRecent || 0}건`);
        console.log(`   평균 거래 건수: ${Math.round(stats.avgRecent || 0)}건`);

        // 5. 샘플 확인
        console.log('\n5. 최근 거래 상위 5개:');
        const samples = await executeQuery(`
            SELECT aptNm, umdNm, sido, sigungu, recentDealCount, dealCount
            FROM apt_search_index
            ORDER BY recentDealCount DESC
            LIMIT 5
        `);
        samples.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.sido} ${row.sigungu} ${row.umdNm} ${row.aptNm} (최근 ${row.recentDealCount}건 / 전체 ${row.dealCount}건)`);
        });

        console.log('\n=== 완료! ===');

    } catch (error) {
        console.error('오류 발생:', error);
        throw error;
    } finally {
        await closeConnection();
    }
}

addRecentDealCount().catch(console.error);
