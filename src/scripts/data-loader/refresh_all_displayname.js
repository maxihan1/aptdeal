#!/usr/bin/env node

/**
 * displayName 전체 갱신 스크립트
 * displayName = aptNm인 아파트들을 카카오 API로 업데이트
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const BATCH_SIZE = 200;
const DELAY_BETWEEN_BATCHES = 2000; // 2초

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function refreshBatch() {
    const response = await fetch(`${BASE_URL}/api/admin/refresh-displayname`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: BATCH_SIZE })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

async function main() {
    console.log('============================================');
    console.log('  displayName 전체 갱신 시작');
    console.log(`  배치 크기: ${BATCH_SIZE}개`);
    console.log('============================================\n');

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalNoChange = 0;
    let totalFailed = 0;
    let batchNum = 0;

    while (true) {
        batchNum++;
        console.log(`\n[배치 ${batchNum}] 처리 중...`);

        try {
            const result = await refreshBatch();

            totalProcessed += result.processed || 0;
            totalUpdated += result.updated || 0;
            totalNoChange += result.noChange || 0;
            totalFailed += result.failed || 0;

            console.log(`  처리: ${result.processed}, 업데이트: ${result.updated}, 변경없음: ${result.noChange}, 실패: ${result.failed}`);
            console.log(`  남은 개수: ${result.remaining}`);

            // 변경 샘플 출력
            if (result.changesSample && result.changesSample.length > 0) {
                console.log(`  변경 샘플:`);
                result.changesSample.slice(0, 5).forEach(c => {
                    console.log(`    ${c.before} → ${c.after}`);
                });
            }

            // 더 이상 처리할 것이 없으면 종료
            if (result.processed === 0 || result.remaining === 0) {
                console.log('\n✅ 모든 처리 완료!');
                break;
            }

            // 배치 간 대기
            await sleep(DELAY_BETWEEN_BATCHES);

        } catch (error) {
            console.error(`  ❌ 에러 발생:`, error.message);
            // 에러 발생 시 잠시 대기 후 재시도
            await sleep(5000);
        }
    }

    console.log('\n============================================');
    console.log('  최종 결과');
    console.log('============================================');
    console.log(`총 처리: ${totalProcessed}개`);
    console.log(`총 업데이트: ${totalUpdated}개`);
    console.log(`총 변경없음: ${totalNoChange}개`);
    console.log(`총 실패: ${totalFailed}개`);
    console.log('============================================\n');
}

main().catch(console.error);
