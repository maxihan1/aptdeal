
import axios from 'axios';
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError, logSection } from './utils/logger.js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 네이버 부동산 검색 API (비공식)
async function searchNaverLand(query) {
    try {
        const url = `https://m.land.naver.com/search/result/${encodeURIComponent(query)}`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            },
            timeout: 10000
        });
        return res.data;
    } catch (e) {
        return null;
    }
}

// 네이버 부동산 단지 검색 API
async function searchComplexes(dong, aptName) {
    try {
        // 지역 검색으로 지역 코드 획득
        const searchQuery = `${dong} ${aptName}`;
        const url = `https://m.land.naver.com/cluster/ajax/search?query=${encodeURIComponent(searchQuery)}&caller=search`;

        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://m.land.naver.com/'
            },
            timeout: 10000
        });

        return res.data;
    } catch (e) {
        return null;
    }
}

// 네이버 부동산 단지 상세 정보
async function getComplexDetail(complexNo) {
    try {
        const url = `https://fin.land.naver.com/complexes/${complexNo}?tab=complex-info`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        // HTML에서 준공년도 추출
        const html = res.data;
        const buildYearMatch = html.match(/준공[^\d]*(\d{4})/);
        const buildYear = buildYearMatch ? buildYearMatch[1] : null;

        const nameMatch = html.match(/<title>([^<]+)/);
        const name = nameMatch ? nameMatch[1].replace(' - 네이버 부동산', '').trim() : null;

        return { complexNo, name, buildYear };
    } catch (e) {
        return null;
    }
}

async function main() {
    logSection("🔍 네이버 부동산 검색으로 매핑 검증");

    // 불일치 케이스 조회
    const query = `
        SELECT 
            m.id,
            m.deal_apt_name,
            m.umd_nm,
            m.kapt_code,
            m.basis_apt_name,
            d.buildYear as deal_year,
            LEFT(b.kaptUsedate, 4) as kapt_year,
            ABS(CAST(d.buildYear AS SIGNED) - CAST(LEFT(b.kaptUsedate, 4) AS SIGNED)) as year_diff
        FROM apt_name_mapping m
        LEFT JOIN (
            SELECT aptNm, umdNm, MAX(buildYear) as buildYear
            FROM apt_deal_info WHERE buildYear IS NOT NULL
            GROUP BY aptNm, umdNm
        ) d ON m.deal_apt_name = d.aptNm COLLATE utf8mb4_unicode_ci 
           AND m.umd_nm = d.umdNm COLLATE utf8mb4_unicode_ci
        LEFT JOIN apt_basic_info b ON m.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode
        WHERE m.confidence_score < 0.8
        ORDER BY year_diff DESC, m.id
    `;

    const mappings = await executeQuery(query);
    console.log(`\n총 ${mappings.length}건 검색 예정\n`);

    const results = [];
    let checked = 0;
    let errors = 0;

    for (const m of mappings) {
        checked++;
        process.stdout.write(`\r검색 중: ${checked}/${mappings.length}`);

        const searchResult = await searchComplexes(m.umd_nm, m.deal_apt_name);

        let naverInfo = null;
        if (searchResult && searchResult.result && searchResult.result.list) {
            const complexList = searchResult.result.list.filter(item => item.type === 'complex');
            if (complexList.length > 0) {
                // 첫 번째 결과의 상세 정보 조회
                const complexNo = complexList[0].id;
                naverInfo = await getComplexDetail(complexNo);
            }
        }

        results.push({
            id: m.id,
            deal_apt_name: m.deal_apt_name,
            umd_nm: m.umd_nm,
            deal_year: m.deal_year,
            current_mapping: m.basis_apt_name,
            kapt_year: m.kapt_year,
            year_diff: m.year_diff,
            naver_name: naverInfo?.name || '',
            naver_year: naverInfo?.buildYear || '',
            naver_match: naverInfo?.buildYear === String(m.deal_year) ? 'O' : 'X'
        });

        await sleep(500); // 요청 간격
    }

    // 결과 저장
    const BOM = '\uFEFF';
    const header = 'ID,실거래명,동,실거래준공,현재매핑,K-apt준공,년도차이,네이버명,네이버준공,일치여부';
    const csvRows = results.map(r =>
        `${r.id},"${r.deal_apt_name}","${r.umd_nm}",${r.deal_year || ''},"${r.current_mapping}",${r.kapt_year || ''},${r.year_diff || ''},"${r.naver_name}",${r.naver_year},${r.naver_match}`
    );

    fs.writeFileSync('naver_verification_result.csv', BOM + header + '\n' + csvRows.join('\n'), 'utf8');

    console.log(`\n\n검색 완료: ${checked}건`);
    console.log('결과 파일: naver_verification_result.csv');

    logSuccess("완료!");
    await closeConnection();
}

main().catch(console.error);
