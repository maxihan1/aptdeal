/**
 * 카카오 API 테스트 - 특정 주소로 아파트명 확인
 */
import 'dotenv/config';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

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
        throw new Error(`Kakao API error: ${response.status}`);
    }

    return response.json();
}

async function main() {
    console.log('=== 카카오 API 아파트명 확인 ===\n');

    if (!KAKAO_REST_API_KEY) {
        console.error('KAKAO_REST_API_KEY 환경변수가 필요합니다');
        process.exit(1);
    }

    // 테스트할 주소들
    const queries = [
        '경기도 부천소사구 소사본동 411-1 아파트',
        '소사본동 주공뜨란채',
        '소사본동 411-1',
        '소새울역중흥S클래스',
    ];

    for (const query of queries) {
        console.log(`\n🔍 검색어: "${query}"`);
        try {
            const result = await searchKakao(query);

            if (result.documents && result.documents.length > 0) {
                result.documents.slice(0, 3).forEach((doc, idx) => {
                    console.log(`   ${idx + 1}. ${doc.place_name}`);
                    console.log(`      주소: ${doc.address_name}`);
                    console.log(`      카테고리: ${doc.category_name}`);
                });
            } else {
                console.log('   검색 결과 없음');
            }
        } catch (e) {
            console.error(`   오류: ${e.message}`);
        }
    }
}

main().catch(console.error);
