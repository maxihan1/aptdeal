/**
 * 카카오 API로 아파트 displayName 업데이트 스크립트
 * apt_search_index에 displayName 컬럼 추가 및 카카오 검색 결과로 업데이트
 */
import { executeQuery, testConnection, closeConnection } from './data-loader/utils/db.js';
import 'dotenv/config';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const DELAY_MS = 100;

async function searchKakao(query, x = null, y = null) {
    const params = new URLSearchParams({
        query: query + ' 아파트',
        size: '5',
    });

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
    console.log('=== 카카오 displayName 업데이트 스크립트 ===\n');

    if (!KAKAO_REST_API_KEY) {
        console.error('KAKAO_REST_API_KEY 환경변수가 필요합니다');
        process.exit(1);
    }

    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 1. displayName 컬럼이 없으면 추가
        console.log('1. displayName 컬럼 확인 및 추가...');
        const columns = await executeQuery('DESCRIBE apt_search_index');
        const hasDisplayName = columns.some(c => c.Field === 'displayName');

        if (!hasDisplayName) {
            console.log('   displayName 컬럼 추가 중...');
            await executeQuery(`
                ALTER TABLE apt_search_index 
                ADD COLUMN displayName VARCHAR(200) DEFAULT NULL AFTER aptNm
            `);
            console.log('   ✅ displayName 컬럼 추가 완료');
        } else {
            console.log('   displayName 컬럼 이미 존재');
        }

        // 2. displayName이 없는 아파트 목록 조회 (kapt_code가 있는 것만)
        console.log('\n2. displayName이 없는 아파트 조회...');
        const apts = await executeQuery(`
            SELECT si.id, si.aptNm, si.umdNm, si.sggCd, si.kapt_code, si.jibun,
                   b.latitude, b.longitude, b.kaptAddr
            FROM apt_search_index si
            LEFT JOIN apt_basic_info b ON si.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.displayName IS NULL 
              AND si.kapt_code IS NOT NULL
            ORDER BY si.dealCount DESC
            LIMIT 100
        `);

        console.log(`   대상: ${apts.length}개\n`);

        if (apts.length === 0) {
            console.log('업데이트할 아파트가 없습니다.');
            return;
        }

        let updated = 0;
        let notFound = 0;
        let errors = 0;

        for (let i = 0; i < apts.length; i++) {
            const apt = apts[i];

            try {
                // 카카오 검색 (주소 기반)
                const searchQuery = apt.kaptAddr || `${apt.umdNm} ${apt.aptNm}`;
                const result = await searchKakao(searchQuery, apt.longitude, apt.latitude);

                if (result.documents && result.documents.length > 0) {
                    let kakaoPlace = result.documents[0];

                    // 카테고리가 아파트인지 확인
                    const aptDoc = result.documents.find(d =>
                        d.category_name && d.category_name.includes('아파트')
                    );
                    if (aptDoc) {
                        kakaoPlace = aptDoc;
                    }

                    // "아파트" 접미사 제거
                    let displayName = kakaoPlace.place_name
                        .replace(/아파트$/g, '')
                        .trim();

                    // 업데이트
                    await executeQuery(`
                        UPDATE apt_search_index
                        SET displayName = ?
                        WHERE id = ?
                    `, [displayName, apt.id]);

                    console.log(`✅ ${apt.aptNm} → ${displayName}`);
                    updated++;
                } else {
                    // 카카오 검색 결과 없으면 기존 aptNm 사용
                    await executeQuery(`
                        UPDATE apt_search_index
                        SET displayName = ?
                        WHERE id = ?
                    `, [apt.aptNm, apt.id]);

                    console.log(`⚠️ ${apt.aptNm} (카카오 미검색, aptNm 사용)`);
                    notFound++;
                }
            } catch (e) {
                console.error(`❌ ${apt.aptNm}: ${e.message}`);
                errors++;
            }

            await sleep(DELAY_MS);

            if ((i + 1) % 20 === 0) {
                console.log(`\n--- 진행: ${i + 1}/${apts.length} | 업데이트: ${updated} ---\n`);
            }
        }

        console.log(`\n=== 완료 ===`);
        console.log(`총 처리: ${apts.length}`);
        console.log(`카카오 검색 성공: ${updated}`);
        console.log(`카카오 미검색: ${notFound}`);
        console.log(`오류: ${errors}`);

        // 특정 아파트 확인
        console.log('\n=== 주공뜨란채 (소사본동) 확인 ===');
        const check = await executeQuery(`
            SELECT aptNm, displayName, umdNm, kapt_code 
            FROM apt_search_index 
            WHERE aptNm = '주공뜨란채' AND umdNm = '소사본동'
        `);
        console.log(JSON.stringify(check, null, 2));

    } finally {
        await closeConnection();
    }
}

main().catch(console.error);
