/**
 * 아파트 주소 → 좌표 변환 배치 스크립트
 * 카카오 주소 검색 API를 사용하여 좌표 수집
 * 
 * 사용법:
 *   node src/scripts/data-loader/fetch_coordinates.js [옵션]
 * 
 * 옵션:
 *   --test        테스트 모드 (10개만 처리)
 *   --limit=N     처리할 최대 개수
 *   --batch=N     배치 크기 (기본: 100)
 *   --delay=N     API 호출 간 지연시간 ms (기본: 100)
 */

import { executeQuery, closeConnection, testConnection } from './utils/db.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// 설정
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_GEOCODE_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

// 명령줄 인수 파싱
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const limitArg = args.find(a => a.startsWith('--limit='));
const batchArg = args.find(a => a.startsWith('--batch='));
const delayArg = args.find(a => a.startsWith('--delay='));

const LIMIT = isTest ? 10 : (limitArg ? parseInt(limitArg.split('=')[1]) : null);
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 100;
const API_DELAY = delayArg ? parseInt(delayArg.split('=')[1]) : 100; // ms

// 지연 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 진행 상황 표시
function printProgress(current, total, success, failed) {
    const percent = ((current / total) * 100).toFixed(1);
    const successRate = ((success / current) * 100).toFixed(1);
    process.stdout.write(`\r⏳ 진행: ${current}/${total} (${percent}%) | ✅ ${success} | ❌ ${failed} | 성공률: ${successRate}%   `);
}

// 카카오 주소 검색 API 호출
async function geocodeAddress(address) {
    if (!address || address.trim() === '') {
        return null;
    }

    try {
        const response = await fetch(
            `${KAKAO_GEOCODE_URL}?query=${encodeURIComponent(address)}`,
            {
                headers: {
                    'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.documents && data.documents.length > 0) {
            const doc = data.documents[0];
            return {
                latitude: parseFloat(doc.y),
                longitude: parseFloat(doc.x),
                address_name: doc.address_name
            };
        }

        // 주소로 검색 실패 시 키워드 검색 시도
        const keywordResponse = await fetch(
            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`,
            {
                headers: {
                    'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`
                }
            }
        );

        if (keywordResponse.ok) {
            const keywordData = await keywordResponse.json();
            if (keywordData.documents && keywordData.documents.length > 0) {
                const doc = keywordData.documents[0];
                return {
                    latitude: parseFloat(doc.y),
                    longitude: parseFloat(doc.x),
                    address_name: doc.address_name || doc.place_name
                };
            }
        }

        return null;
    } catch (error) {
        console.error(`\n⚠️ API 오류 (${address}):`, error.message);
        return null;
    }
}

// DB 업데이트
async function updateCoordinates(kaptCode, latitude, longitude) {
    await executeQuery(`
        UPDATE apt_basic_info 
        SET latitude = ?, longitude = ?
        WHERE kaptCode = ?
    `, [latitude, longitude, kaptCode]);
}

// 메인 함수
async function main() {
    console.log('🗺️ 아파트 좌표 수집 스크립트 시작\n');
    console.log(`📋 설정:`);
    console.log(`   - API 키: ${KAKAO_REST_API_KEY ? '✅ 설정됨' : '❌ 없음'}`);
    console.log(`   - 배치 크기: ${BATCH_SIZE}`);
    console.log(`   - API 지연: ${API_DELAY}ms`);
    console.log(`   - 제한: ${LIMIT || '없음'}`);
    console.log(`   - 테스트 모드: ${isTest ? '예' : '아니오'}\n`);

    if (!KAKAO_REST_API_KEY) {
        console.error('❌ KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.');
        console.error('   .env 파일에 KAKAO_REST_API_KEY=your_key 추가해주세요.');
        process.exit(1);
    }

    // DB 연결
    const connected = await testConnection();
    if (!connected) {
        process.exit(1);
    }

    try {
        // 좌표 없는 아파트 조회
        console.log('📊 좌표가 없는 아파트 조회 중...');

        let query = `
            SELECT kaptCode, kaptName, kaptAddr 
            FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL 
            AND kaptAddr != ''
        `;

        if (LIMIT) {
            query += ` LIMIT ${LIMIT}`;
        }

        const apartments = await executeQuery(query);

        if (apartments.length === 0) {
            console.log('✅ 모든 아파트에 좌표가 등록되어 있습니다!');
            await closeConnection();
            return;
        }

        console.log(`📍 처리 대상: ${apartments.length}개 아파트\n`);

        // 배치 처리
        let successCount = 0;
        let failCount = 0;
        const startTime = Date.now();

        for (let i = 0; i < apartments.length; i++) {
            const apt = apartments[i];

            // 주소 검색
            const coords = await geocodeAddress(apt.kaptAddr);

            if (coords) {
                await updateCoordinates(apt.kaptCode, coords.latitude, coords.longitude);
                successCount++;
            } else {
                // 단지명 + 주소로 재시도
                const altCoords = await geocodeAddress(`${apt.kaptName} ${apt.kaptAddr}`);
                if (altCoords) {
                    await updateCoordinates(apt.kaptCode, altCoords.latitude, altCoords.longitude);
                    successCount++;
                } else {
                    failCount++;
                }
            }

            printProgress(i + 1, apartments.length, successCount, failCount);

            // API 지연
            if (i < apartments.length - 1) {
                await sleep(API_DELAY);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n\n' + '='.repeat(50));
        console.log('📊 수집 완료 결과');
        console.log('='.repeat(50));
        console.log(`✅ 성공: ${successCount}개`);
        console.log(`❌ 실패: ${failCount}개`);
        console.log(`⏱️ 소요시간: ${elapsed}초`);
        console.log(`📈 성공률: ${((successCount / apartments.length) * 100).toFixed(1)}%`);

        // 전체 현황
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) as with_coords,
                SUM(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 ELSE 0 END) as without_coords
            FROM apt_basic_info
        `);

        console.log('\n📋 전체 좌표 현황:');
        console.log(`   총 아파트: ${stats[0].total}개`);
        console.log(`   좌표 있음: ${stats[0].with_coords}개 (${((stats[0].with_coords / stats[0].total) * 100).toFixed(1)}%)`);
        console.log(`   좌표 없음: ${stats[0].without_coords}개`);

    } catch (error) {
        console.error('\n❌ 오류 발생:', error.message);
        throw error;
    } finally {
        await closeConnection();
    }
}

main().catch(console.error);
