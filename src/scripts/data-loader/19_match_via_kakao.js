/**
 * 카카오 키워드 검색 API를 사용하여 아파트명 매칭
 * 
 * K-apt 아파트명을 카카오에서 검색하여 정규화된 이름 획득
 * 그 이름으로 실거래 데이터와 매칭
 * 
 * 실행: node src/scripts/data-loader/19_match_via_kakao.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import 'dotenv/config';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const DELAY_MS = 100; // API 호출 간 딜레이 (rate limit 방지)

async function searchKakao(query, x = null, y = null) {
    const params = new URLSearchParams({
        query: query + ' 아파트',  // 아파트 키워드 추가
        size: '5',
    });

    // 좌표가 있으면 근처 우선 검색
    if (x && y) {
        params.append('x', String(x));
        params.append('y', String(y));
        params.append('radius', '500');
    }

    const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
        {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Kakao API error: ${response.status}`);
    }

    return response.json();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('=== 카카오 키워드 검색으로 아파트명 매칭 ===\n');

    if (!KAKAO_REST_API_KEY) {
        console.error('KAKAO_REST_API_KEY 환경변수가 필요합니다');
        process.exit(1);
    }

    const connected = await testConnection();
    if (!connected) {
        console.error('데이터베이스 연결 실패');
        process.exit(1);
    }

    try {
        // 가격 없고 임대 아닌 아파트 조회 (1,252건)
        const noPriceApts = await executeQuery(`
            SELECT pc.kapt_code, pc.kapt_name, b.kaptAddr, b.latitude, b.longitude
            FROM apt_price_cache pc
            JOIN apt_basic_info b ON pc.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE (pc.avg_price_365d = 0 OR pc.avg_price_365d IS NULL) 
              AND (pc.last_deal_price = 0 OR pc.last_deal_price IS NULL)
              AND pc.is_rental = FALSE
            ORDER BY b.kaptdaCnt DESC
        `);

        console.log(`대상: ${noPriceApts.length}개\n`);

        let matched = 0;
        let notFound = 0;
        let errors = 0;

        for (let i = 0; i < noPriceApts.length; i++) {
            const apt = noPriceApts[i];

            try {
                // 카카오 검색
                const result = await searchKakao(apt.kapt_name, apt.longitude, apt.latitude);

                if (result.documents && result.documents.length > 0) {
                    const kakaoPlace = result.documents[0];
                    const kakaoName = kakaoPlace.place_name
                        .replace(/아파트$/g, '')
                        .replace(/\s+/g, '')
                        .trim();

                    // 주소에서 동 추출
                    const addrParts = apt.kaptAddr.split(' ');
                    let dong = '';
                    for (const part of addrParts) {
                        if (part.endsWith('동') || part.endsWith('읍') || part.endsWith('면') || part.endsWith('리')) {
                            dong = part;
                            break;
                        }
                    }

                    // 실거래에서 카카오 이름으로 검색
                    const dealQuery = `
                        SELECT 
                            ROUND(AVG(dealAmount)) as avg_price,
                            COUNT(*) as deal_count,
                            MAX(dealAmount) as last_price,
                            MAX(dealDate) as last_date
                        FROM apt_deal_info
                        WHERE (
                            REPLACE(aptNm, ' ', '') = ?
                            OR REPLACE(aptNm, ' ', '') LIKE CONCAT(?, '%')
                        )
                        AND (cdealType IS NULL OR cdealType = '')
                    `;

                    const price = await executeQuery(dealQuery, [kakaoName, kakaoName]);

                    if (price.length > 0 && price[0].avg_price > 0) {
                        // 가격 캐시 업데이트
                        await executeQuery(`
                            UPDATE apt_price_cache
                            SET avg_price_365d = ?,
                                deal_count_365d = ?,
                                last_deal_price = ?,
                                last_deal_date = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE kapt_code = ? AND avg_price_365d = 0
                        `, [price[0].avg_price, price[0].deal_count, price[0].last_price, price[0].last_date, apt.kapt_code]);

                        console.log(`✅ ${apt.kapt_name} → ${kakaoPlace.place_name} → ${price[0].deal_count}건, ${Math.round(price[0].avg_price / 10000)}억`);
                        matched++;
                    } else {
                        console.log(`⚠️ ${apt.kapt_name} → ${kakaoPlace.place_name} (실거래 없음)`);
                        notFound++;
                    }
                } else {
                    console.log(`❌ ${apt.kapt_name} (카카오 검색 결과 없음)`);
                    notFound++;
                }
            } catch (e) {
                console.error(`오류 ${apt.kapt_name}:`, e.message);
                errors++;
            }

            // Rate limit 방지
            await sleep(DELAY_MS);

            if ((i + 1) % 20 === 0) {
                console.log(`\n--- 진행: ${i + 1}/${noPriceApts.length} | 매칭: ${matched} ---\n`);
            }
        }

        console.log(`\n=== 완료 ===`);
        console.log(`총 처리: ${noPriceApts.length}`);
        console.log(`매칭 성공: ${matched}`);
        console.log(`매칭 실패: ${notFound}`);
        console.log(`오류: ${errors}`);

        // 최종 확인
        const [after] = await executeQuery(`
            SELECT COUNT(*) as cnt FROM apt_price_cache 
            WHERE (avg_price_365d = 0 OR avg_price_365d IS NULL) 
              AND (last_deal_price = 0 OR last_deal_price IS NULL)
        `);
        console.log(`\n가격 없음 (최종): ${after.cnt.toLocaleString()}`);

    } catch (error) {
        console.error('오류:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }
}

main().catch(error => {
    console.error('스크립트 실행 실패:', error);
    process.exit(1);
});
