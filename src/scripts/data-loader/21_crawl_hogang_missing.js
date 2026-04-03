/**
 * 21_crawl_hogang_missing.js
 * 
 * 호갱노노 검색 API를 활용하여 미매핑 단지의 정보를 크롤링
 * 
 * - Puppeteer로 호갱노노 검색 → 네트워크 응답 캡처 (기존 verify_with_hogang.js 패턴)
 * - 정규화된 이름, 주소, 세대수, 좌표, 거래건수 수집
 * - 진행 상황 저장으로 중단/재개 지원
 * - 거래량 상위 순서로 처리 (영향 큰 단지 우선)
 * 
 * 실행:
 *   node src/scripts/data-loader/21_crawl_hogang_missing.js [--limit=100] [--resume]
 */

import puppeteer from 'puppeteer';
import { executeQuery, closeConnection } from './utils/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── 설정 ──────────────────────────────────────────
const CRAWL_DELAY_MS = 1500;
const PROGRESS_FILE = path.join(__dirname, 'logs', 'hogang_crawl_progress.json');
const RESULTS_FILE = path.join(__dirname, 'logs', 'hogang_crawl_results.json');

async function main() {
    const args = process.argv.slice(2);
    const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');
    const resume = args.includes('--resume');

    console.log('=============================================================');
    console.log('  🕷️ 호갱노노 크롤링으로 미매핑 단지 데이터 수집');
    console.log(`  설정: limit=${limit}, resume=${resume}`);
    console.log('=============================================================\n');

    // ── 1. 미매핑 단지 목록 조회 ────────────────────
    console.log('📋 미매핑 단지 목록 조회 중...\n');

    // Step 1: 매핑 키 로드
    const mappedRows = await executeQuery(`SELECT deal_apt_name, sgg_cd, umd_nm FROM apt_name_mapping`);
    const mappedKeys = new Set(
        mappedRows.map(r => `${(r.deal_apt_name || '').replace(/\s+/g, '').toLowerCase()}__${r.sgg_cd}__${(r.umd_nm || '').replace(/\s+/g, '').toLowerCase()}`)
    );
    console.log(`   매핑 키 ${mappedKeys.size}개 로드 완료`);

    // Step 2: 실거래 단지 그룹 조회
    console.log('   실거래 단지 그룹 조회 중...');
    const dealGroups = await executeQuery(`
        SELECT aptNm, sggCd, umdNm, MIN(jibun) as jibuns, COUNT(*) as dealCount, MAX(buildYear) as buildYear
        FROM apt_deal_info
        WHERE aptNm IS NOT NULL AND aptNm != ''
        GROUP BY aptNm, sggCd, umdNm
        ORDER BY dealCount DESC
    `);

    // Step 3: JS 필터링
    const unmappedList = dealGroups
        .filter(d => {
            const key = `${(d.aptNm || '').replace(/\s+/g, '').toLowerCase()}__${d.sggCd}__${(d.umdNm || '').replace(/\s+/g, '').toLowerCase()}`;
            return !mappedKeys.has(key);
        })
        .slice(0, limit);

    console.log(`   총 ${unmappedList.length}개 단지 크롤링 예정\n`);

    // ── 2. 이전 진행 상황 로드 ────────────────────────
    let progress = { completed: [], lastIndex: 0 };
    let results = [];

    if (resume && fs.existsSync(PROGRESS_FILE)) {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        console.log(`   ♻️ 이전 진행 재개: ${progress.completed.length}건 완료됨\n`);
    }
    if (resume && fs.existsSync(RESULTS_FILE)) {
        results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    }

    const completedKeys = new Set(progress.completed);

    // ── 3. 크롤링 시작 ───────────────────────────────
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    let crawled = 0;
    let matched = 0;
    let noResult = 0;
    let errors = 0;
    const totalToCrawl = unmappedList.length - completedKeys.size;

    for (let i = 0; i < unmappedList.length; i++) {
        const apt = unmappedList[i];
        const key = `${apt.aptNm}__${apt.sggCd}__${apt.umdNm}`;

        if (completedKeys.has(key)) continue;

        crawled++;
        const searchQuery = `${apt.umdNm} ${apt.aptNm}`;

        process.stdout.write(
            `\r   [${crawled}/${totalToCrawl}] "${searchQuery}" (거래 ${apt.dealCount}건)...                    `
        );

        const page = await browser.newPage();
        let apiData = null;

        // 네트워크 응답 캡처 (호갱노노 검색 API)
        page.on('response', async response => {
            const url = response.url();
            if (url.includes('/api/') && url.includes('search') && response.status() === 200) {
                try {
                    const json = await response.json();
                    if (json?.data?.matched?.apt?.list) {
                        apiData = json;
                    }
                } catch (e) { /* ignore */ }
            }
        });

        try {
            await page.goto('https://hogangnono.com/', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 검색창 찾기
            const searchInput = await page.$(
                'input[type="search"], input[placeholder*="검색"], input[name="q"], .search-input, #search, input[type="text"]'
            );

            if (searchInput) {
                await searchInput.type(searchQuery, { delay: 80 });
                await sleep(2500);

                if (apiData?.data?.matched?.apt?.list?.length > 0) {
                    const aptList = apiData.data.matched.apt.list;
                    const bestMatch = findBestMatch(apt, aptList);

                    results.push({
                        aptNm: apt.aptNm,
                        sggCd: apt.sggCd,
                        umdNm: apt.umdNm,
                        dealCount: apt.dealCount,
                        buildYear: apt.buildYear,
                        jibuns: apt.jibuns,
                        hogang: bestMatch ? {
                            id: bestMatch.id,
                            name: bestMatch.name,
                            address: bestMatch.address,
                            roadAddress: bestMatch.road_address,
                            household: bestMatch.household,
                            lat: bestMatch.lat,
                            lng: bestMatch.lng,
                            startDate: bestMatch.start_date,
                            tradeCount: bestMatch.trade_count,
                            matchType: bestMatch._matchType,
                            matchScore: bestMatch._matchScore
                        } : null,
                        allResults: aptList.slice(0, 3).map(a => ({
                            name: a.name,
                            address: a.address,
                            household: a.household
                        }))
                    });

                    matched += bestMatch ? 1 : 0;
                    noResult += bestMatch ? 0 : 1;
                } else {
                    results.push({
                        aptNm: apt.aptNm,
                        sggCd: apt.sggCd,
                        umdNm: apt.umdNm,
                        dealCount: apt.dealCount,
                        hogang: null,
                        allResults: []
                    });
                    noResult++;
                }
            }
        } catch (err) {
            errors++;
            results.push({
                aptNm: apt.aptNm,
                sggCd: apt.sggCd,
                umdNm: apt.umdNm,
                dealCount: apt.dealCount,
                hogang: null,
                error: err.message
            });
        }

        await page.close();

        // 진행 상황 저장 (10건마다)
        completedKeys.add(key);
        progress.completed.push(key);
        progress.lastIndex = i;

        if (crawled % 10 === 0) {
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
            fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
            process.stdout.write(` [저장됨]`);
        }

        await sleep(CRAWL_DELAY_MS);
    }

    await browser.close();

    // ── 4. 최종 결과 저장 ─────────────────────────────
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');

    // ── 5. 결과 요약 ─────────────────────────────────
    console.log('\n\n=============================================================');
    console.log('  📊 크롤링 결과 요약');
    console.log('=============================================================');
    console.log(`  처리 건수:  ${crawled}`);
    console.log(`  매칭 성공:  ${matched} (${crawled > 0 ? ((matched / crawled) * 100).toFixed(1) : 0}%)`);
    console.log(`  미매칭:     ${noResult}`);
    console.log(`  오류:       ${errors}`);
    console.log(`\n  결과 파일: ${RESULTS_FILE}`);
    console.log('=============================================================\n');
    console.log('  💡 다음 단계: node src/scripts/data-loader/22_auto_mapping_pipeline.js\n');

    await closeConnection();
}

/**
 * 호갱노노 검색 결과에서 가장 적합한 매칭을 찾는 함수
 */
function findBestMatch(dealApt, hogangList) {
    const normalizedDealName = normalize(dealApt.aptNm);
    const umdNm = dealApt.umdNm;

    const scored = hogangList
        .filter(h => h.type === 0) // 아파트만 (오피스텔 제외)
        .map(h => {
            let score = 0;
            let matchType = 'none';
            const normalizedHogangName = normalize(h.name);

            // 1. 정확한 이름 일치 (+50)
            if (normalizedHogangName === normalizedDealName) {
                score += 50;
                matchType = 'exact_name';
            }
            // 2. 이름 포함 관계 (+30)
            else if (normalizedHogangName.includes(normalizedDealName) || normalizedDealName.includes(normalizedHogangName)) {
                score += 30;
                matchType = 'partial_name';
            }
            // 3. 이름 앞 3자 일치 (+15)
            else if (normalizedDealName.length >= 3 && normalizedHogangName.length >= 3 &&
                normalizedHogangName.slice(0, 3) === normalizedDealName.slice(0, 3)) {
                score += 15;
                matchType = 'prefix_name';
            }

            // 4. 동 이름이 주소에 포함 (+25)
            if (h.address && h.address.includes(umdNm)) {
                score += 25;
            }

            // 5. 건축년도 일치 (+10)
            if (dealApt.buildYear && h.start_date) {
                const hogangYear = parseInt(h.start_date.substring(0, 4));
                if (Math.abs(dealApt.buildYear - hogangYear) <= 2) {
                    score += 10;
                }
            }

            // 6. 지번 일치 (+20)
            if (dealApt.jibuns && h.address) {
                const jibunList = dealApt.jibuns.split(',');
                for (const jibun of jibunList) {
                    if (h.address.includes(jibun.trim())) {
                        score += 20;
                        break;
                    }
                }
            }

            return { ...h, _matchScore: score, _matchType: matchType };
        })
        .filter(h => h._matchScore >= 25)
        .sort((a, b) => b._matchScore - a._matchScore);

    return scored.length > 0 ? scored[0] : null;
}

/**
 * 아파트명 정규화
 */
function normalize(name) {
    return (name || '')
        .replace(/\s+/g, '')
        .replace(/[^\w가-힣0-9]/g, '')
        .toLowerCase();
}

main().catch(err => {
    console.error('스크립트 오류:', err);
    process.exit(1);
});
