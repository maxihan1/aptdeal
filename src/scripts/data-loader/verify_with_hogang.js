
import puppeteer from 'puppeteer';
import { executeQuery, closeConnection } from './utils/db.js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log("🔍 호갱노노 검색으로 매핑 검증\n");

    // 불일치 케이스 조회 (10년 이상)
    const mappings = await executeQuery(`
        SELECT 
            m.id,
            m.deal_apt_name,
            m.umd_nm,
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
          AND d.buildYear IS NOT NULL
          AND b.kaptUsedate IS NOT NULL
          AND ABS(CAST(d.buildYear AS SIGNED) - CAST(LEFT(b.kaptUsedate, 4) AS SIGNED)) >= 10
        ORDER BY year_diff DESC
        LIMIT 20
    `);

    console.log(`${mappings.length}건 검색 예정\n`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = [];

    for (const m of mappings) {
        console.log(`\n[${m.id}] ${m.deal_apt_name} (${m.umd_nm}) - 실거래:${m.deal_year}, K-apt:${m.kapt_year}`);

        const page = await browser.newPage();

        // 네트워크 요청 캡처
        let apiData = null;
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('/api/') && url.includes('search')) {
                try {
                    const json = await response.json();
                    apiData = json;
                    console.log('  API 응답:', JSON.stringify(json).substring(0, 500));
                } catch (e) { }
            }
        });

        try {
            await page.goto('https://hogangnono.com/', { waitUntil: 'networkidle2', timeout: 30000 });

            // 검색창 찾기
            const searchInput = await page.$('input[type="search"], input[placeholder*="검색"], input[name="q"], .search-input, #search');

            if (searchInput) {
                const searchQuery = `${m.umd_nm} ${m.deal_apt_name}`;
                await searchInput.type(searchQuery, { delay: 100 });
                await sleep(2000);

                // 자동완성 결과 캡처
                const suggestions = await page.$$eval('.search-suggestion, .autocomplete-item, [class*="suggest"]',
                    items => items.map(item => item.textContent.trim())
                );

                if (suggestions.length > 0) {
                    console.log('  검색 결과:', suggestions.slice(0, 5));
                }
            }

            results.push({
                ...m,
                hogang_result: apiData || 'N/A'
            });

        } catch (e) {
            console.log('  에러:', e.message);
            results.push({
                ...m,
                hogang_result: 'ERROR'
            });
        }

        await page.close();
        await sleep(1000);
    }

    await browser.close();

    // 결과 저장
    fs.writeFileSync('hogang_verification.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('\n결과 저장: hogang_verification.json');

    await closeConnection();
}

main().catch(console.error);
