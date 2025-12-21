/**
 * 카카오 API로 displayName이 없는 아파트의 정식 명칭 수집
 * 
 * 대상: apt_search_index에서 displayName IS NULL인 아파트
 * 방법: 카카오 키워드 검색 API로 "동 아파트명" 검색하여 정식 명칭 획득
 * 
 * 예상 소요 시간: ~22,000건 × 0.1초 = ~37분
 * 
 * 실행: node src/scripts/collect_display_names.js
 */

import { executeQuery, testConnection, closeConnection } from './data-loader/utils/db.js';
import 'dotenv/config';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const DELAY_MS = 100; // API 호출 간 딜레이 (rate limit 방지)
const BATCH_SIZE = 500; // 한 번에 조회할 아파트 수

async function searchKakao(query) {
    const params = new URLSearchParams({
        query: query,
        size: '5',
    });

    const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
        {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
            }
        }
    );

    if (!response.ok) {
        if (response.status === 429) {
            // Rate limit - 잠시 대기 후 재시도
            await sleep(1000);
            return searchKakao(query);
        }
        throw new Error(`Kakao API error: ${response.status}`);
    }

    return response.json();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('=== 카카오 API로 displayName 수집 ===\n');
    console.log(`시작 시간: ${new Date().toLocaleString('ko-KR')}\n`);

    if (!KAKAO_REST_API_KEY) {
        console.error('KAKAO_REST_API_KEY 환경변수가 필요합니다');
        process.exit(1);
    }

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 전체 현황 확인
        const [stats] = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN displayName IS NOT NULL THEN 1 ELSE 0 END) as has_display_name
            FROM apt_search_index
        `);
        console.log(`전체: ${Number(stats.total).toLocaleString()}개`);
        console.log(`displayName 있음: ${Number(stats.has_display_name).toLocaleString()}개`);
        console.log(`displayName 없음: ${(stats.total - stats.has_display_name).toLocaleString()}개\n`);

        let totalProcessed = 0;
        let totalUpdated = 0;
        let totalNotFound = 0;
        let totalErrors = 0;
        let hasMore = true;

        while (hasMore) {
            // displayName이 없는 아파트 조회 (배치 단위)
            const apts = await executeQuery(`
                SELECT id, aptNm, umdNm, sido, sigungu
                FROM apt_search_index
                WHERE displayName IS NULL
                ORDER BY dealCount DESC
                LIMIT ${BATCH_SIZE}
            `);

            if (apts.length === 0) {
                hasMore = false;
                console.log('\n✅ 모든 아파트 처리 완료!');
                break;
            }

            console.log(`\n--- 배치 처리: ${apts.length}개 ---`);

            for (let i = 0; i < apts.length; i++) {
                const apt = apts[i];
                totalProcessed++;

                try {
                    // 카카오 검색 쿼리: "시군구 동 아파트명 아파트"
                    const searchQuery = `${apt.sigungu} ${apt.umdNm} ${apt.aptNm} 아파트`;
                    const result = await searchKakao(searchQuery);

                    let displayName = apt.aptNm; // 기본값

                    if (result.documents && result.documents.length > 0) {
                        // 아파트 카테고리인 결과 우선
                        const aptDoc = result.documents.find(d =>
                            d.category_name && d.category_name.includes('아파트')
                        );

                        if (aptDoc) {
                            // "아파트" 접미사 제거
                            displayName = aptDoc.place_name
                                .replace(/아파트$/g, '')
                                .trim();
                        } else {
                            // 첫 번째 결과 사용
                            displayName = result.documents[0].place_name
                                .replace(/아파트$/g, '')
                                .trim();
                        }
                        totalUpdated++;
                    } else {
                        // 검색 결과 없으면 원본 aptNm 사용
                        totalNotFound++;
                    }

                    // displayName 업데이트
                    await executeQuery(`
                        UPDATE apt_search_index
                        SET displayName = ?
                        WHERE id = ?
                    `, [displayName, apt.id]);

                    // 진행 상황 출력 (20개마다)
                    if (totalProcessed % 20 === 0) {
                        const progress = ((totalProcessed / (stats.total - stats.has_display_name)) * 100).toFixed(1);
                        console.log(`[${progress}%] 처리: ${totalProcessed} | 카카오: ${totalUpdated} | 미검색: ${totalNotFound}`);
                    }

                } catch (e) {
                    console.error(`❌ ${apt.aptNm}: ${e.message}`);
                    totalErrors++;

                    // 에러 시에도 aptNm으로 설정 (NULL 방지)
                    await executeQuery(`
                        UPDATE apt_search_index
                        SET displayName = ?
                        WHERE id = ?
                    `, [apt.aptNm, apt.id]);
                }

                // Rate limit 방지
                await sleep(DELAY_MS);
            }

            // 배치 완료 후 현황 출력
            console.log(`배치 완료 - 총 처리: ${totalProcessed}`);
        }

        console.log(`\n${'='.repeat(50)}`);
        console.log('=== 최종 결과 ===');
        console.log(`총 처리: ${totalProcessed.toLocaleString()}`);
        console.log(`카카오 검색 성공: ${totalUpdated.toLocaleString()}`);
        console.log(`카카오 미검색: ${totalNotFound.toLocaleString()}`);
        console.log(`오류: ${totalErrors.toLocaleString()}`);
        console.log(`종료 시간: ${new Date().toLocaleString('ko-KR')}`);

        // 최종 현황
        const [finalStats] = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN displayName IS NOT NULL THEN 1 ELSE 0 END) as has_display_name
            FROM apt_search_index
        `);
        console.log(`\n최종 displayName 현황: ${Number(finalStats.has_display_name).toLocaleString()} / ${Number(finalStats.total).toLocaleString()}`);

    } finally {
        await closeConnection();
    }
}

main().catch(error => {
    console.error('스크립트 실행 실패:', error);
    process.exit(1);
});
