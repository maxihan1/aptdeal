/**
 * sync_mapping.js
 * 
 * 자동 매핑 엔진 모듈 — 5단계 매칭 파이프라인
 * 
 * 22_auto_mapping_pipeline.js에서 핵심 로직을 추출하여
 * 06_daily_sync.js (weekly)와 22_auto_mapping_pipeline.js 모두에서 재사용.
 * 
 * 사용법:
 *   import { loadMappingData, runMappingPipeline, applyMappings } from './sync_mapping.js';
 *   
 *   const data = await loadMappingData();
 *   const { newMappings, stats } = runMappingPipeline(data, { stages: [1,2,3,4,5] });
 *   await applyMappings(newMappings, false);
 */

import { executeQuery } from './utils/db.js';
import { log, logError, logWarning } from './utils/logger.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOGANG_RESULTS_FILE = path.join(__dirname, 'logs', 'hogang_crawl_results.json');

// ══════════════════════════════════════════════════
// 헬퍼 함수 (공유)
// ══════════════════════════════════════════════════

/**
 * 아파트명 정규화
 * 공백, 접미사("아파트"), 차수 표기 통일
 */
export function normalizeAptName(name) {
    return (name || '')
        .replace(/\s+/g, '')
        .replace(/아파트$/g, '')
        .replace(/(\d+)차$/g, '$1차')
        .replace(/제(\d+)차/g, '$1차')
        .replace(/(\d+)단지$/g, '$1단지')
        .replace(/제(\d+)단지/g, '$1단지')
        .replace(/[^\w가-힣0-9]/g, '')
        .toLowerCase();
}

/**
 * 정규화된 이름의 글자를 정렬하여 비교 키 생성
 * 단어 순서가 뒤바뀐 경우 매칭에 사용
 */
export function sortedChars(normalizedName) {
    return normalizedName.split('').sort().join('');
}

/**
 * 매핑 고유 키 생성 (aptNm + sggCd + umdNm)
 */
export function makeKey(aptNm, sggCd, umdNm) {
    return `${(aptNm || '').replace(/\s+/g, '').toLowerCase()}__${sggCd}__${(umdNm || '').replace(/\s+/g, '').toLowerCase()}`;
}

// ══════════════════════════════════════════════════
// 데이터 로드
// ══════════════════════════════════════════════════

/**
 * DB에서 매핑 관련 데이터를 메모리에 로드
 * @returns {Promise<Object>} mappedKeys, basicByNormName, basicByAddr, basicInfoRows, unmapped
 */
export async function loadMappingData() {
    log('📥 매핑 데이터 로드 중...');

    // 1) 이미 매핑된 키 세트
    const mappedRows = await executeQuery(`SELECT deal_apt_name, sgg_cd, umd_nm FROM apt_name_mapping`);
    const mappedKeys = new Set(
        mappedRows.map(r => makeKey(r.deal_apt_name, r.sgg_cd, r.umd_nm))
    );
    log(`   매핑 키: ${mappedKeys.size}개`);

    // 2) apt_basic_info 전체 로드
    const basicInfoRows = await executeQuery(`
        SELECT kaptCode, kaptName, kaptAddr, kaptdaCnt FROM apt_basic_info
    `);
    log(`   apt_basic_info: ${basicInfoRows.length}개`);

    // 인덱스 생성
    const basicByNormName = new Map();
    const basicByAddr = new Map();

    for (const b of basicInfoRows) {
        const normName = normalizeAptName(b.kaptName);
        const noSpaceName = (b.kaptName || '').replace(/\s+/g, '').toLowerCase();

        if (!basicByNormName.has(normName)) basicByNormName.set(normName, []);
        basicByNormName.get(normName).push(b);

        if (!basicByNormName.has(noSpaceName)) basicByNormName.set(noSpaceName, []);
        basicByNormName.get(noSpaceName).push(b);

        // 주소에서 동 이름 추출하여 인덱싱
        const addr = b.kaptAddr || '';
        const addrParts = addr.split(/\s+/);
        for (const part of addrParts) {
            if (part.endsWith('동') || part.endsWith('읍') || part.endsWith('면') || part.endsWith('리') || part.endsWith('가')) {
                if (!basicByAddr.has(part)) basicByAddr.set(part, []);
                basicByAddr.get(part).push(b);
            }
        }
    }

    // 3) 실거래 단지 그룹 로드
    const dealGroups = await executeQuery(`
        SELECT aptNm, sggCd, umdNm, MIN(jibun) as jibun, COUNT(*) as dealCount
        FROM apt_deal_info
        WHERE aptNm IS NOT NULL AND aptNm != ''
        GROUP BY aptNm, sggCd, umdNm
        ORDER BY dealCount DESC
    `);
    log(`   실거래 단지 그룹: ${dealGroups.length}개`);

    // 미매핑 필터링
    const unmapped = dealGroups.filter(d => !mappedKeys.has(makeKey(d.aptNm, d.sggCd, d.umdNm)));
    log(`   미매핑: ${unmapped.length}개`);

    return {
        mappedKeys,
        basicByNormName,
        basicByAddr,
        basicInfoRows,
        unmapped,
        dealGroups,
    };
}

// ══════════════════════════════════════════════════
// 매핑 파이프라인
// ══════════════════════════════════════════════════

/**
 * 5단계 매핑 파이프라인 실행
 * @param {Object} data - loadMappingData() 출력
 * @param {Object} options
 * @param {number[]} options.stages - 활성 단계 (기본: [1,2,3,4,5])
 * @param {number} options.kakaoLimit - Stage 5 카카오 검색 최대 건수 (기본: 300)
 * @param {string} options.kakaoKey - 카카오 API 키
 * @returns {{ newMappings: Array, stats: Object, unmappedRemaining: Array }}
 */
export async function runMappingPipeline(data, options = {}) {
    const {
        stages = [1, 2, 3, 4, 5],
        kakaoLimit = 300,
        kakaoKey = null,
    } = options;

    const { basicByNormName, basicByAddr, basicInfoRows, unmapped } = data;
    const stats = { stage1: 0, stage2: 0, stage2_5: 0, stage3: 0, stage4: 0, stage5: 0, errors: 0 };
    const newMappings = [];

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ━━━ Stage 1: 정확한 이름 일치 (confidence: 1.0) ━━━
    if (stages.includes(1)) {
        log('━━━ Stage 1: 정확한 이름 일치 (confidence: 1.0) ━━━');

        for (const apt of unmapped) {
            if (apt._mapped) continue;

            const noSpaceName = (apt.aptNm || '').replace(/\s+/g, '').toLowerCase();
            const candidates = basicByNormName.get(noSpaceName) || [];

            const match = candidates.find(b => (b.kaptAddr || '').includes(apt.umdNm));

            if (match) {
                apt._mapped = true;
                stats.stage1++;
                newMappings.push({
                    apt, kaptCode: match.kaptCode, kaptName: match.kaptName,
                    type: 'exact', conf: 1.0
                });
            }
        }
        log(`   ✅ Stage 1 매핑: ${stats.stage1}건`);
    }

    // ━━━ Stage 2: 정규화 이름 매칭 (confidence: 0.95) ━━━
    if (stages.includes(2)) {
        log('━━━ Stage 2: 정규화 이름 매칭 (confidence: 0.95) ━━━');

        for (const apt of unmapped) {
            if (apt._mapped) continue;

            const normalized = normalizeAptName(apt.aptNm);
            const candidates = basicByNormName.get(normalized) || [];

            const match = candidates.find(b => (b.kaptAddr || '').includes(apt.umdNm));

            if (match) {
                apt._mapped = true;
                stats.stage2++;
                newMappings.push({
                    apt, kaptCode: match.kaptCode, kaptName: match.kaptName,
                    type: 'normalized', conf: 0.95
                });
            }
        }
        log(`   ✅ Stage 2 매핑: ${stats.stage2}건`);
    }

    // ━━━ Stage 2.5: 단어 순서 뒤바뀜 감지 (confidence: 0.93) ━━━
    if (stages.includes(2)) {
        log('━━━ Stage 2.5: 단어 순서 뒤바뀜 감지 (confidence: 0.93) ━━━');

        const basicByDong = new Map();
        for (const b of basicInfoRows) {
            const addr = b.kaptAddr || '';
            const addrParts = addr.split(/\s+/);
            for (const part of addrParts) {
                if (part.endsWith('동') || part.endsWith('읍') || part.endsWith('면') || part.endsWith('리') || part.endsWith('가')) {
                    if (!basicByDong.has(part)) basicByDong.set(part, []);
                    basicByDong.get(part).push(b);
                }
            }
        }

        for (const apt of unmapped) {
            if (apt._mapped) continue;

            const dealNorm = normalizeAptName(apt.aptNm);
            const dealSorted = sortedChars(dealNorm);
            const candidates = basicByDong.get(apt.umdNm) || [];

            for (const b of candidates) {
                const basisNorm = normalizeAptName(b.kaptName);
                if (dealNorm === basisNorm) continue;

                const basisSorted = sortedChars(basisNorm);
                if (dealSorted === basisSorted && dealSorted.length >= 4) {
                    apt._mapped = true;
                    stats.stage2_5++;
                    newMappings.push({
                        apt, kaptCode: b.kaptCode, kaptName: b.kaptName,
                        type: 'normalized', conf: 0.93
                    });
                    break;
                }
            }
        }
        log(`   ✅ Stage 2.5 매핑: ${stats.stage2_5}건`);
    }

    // ━━━ Stage 3: 호갱노노 크롤링 결과 활용 (confidence: 0.9) ━━━
    if (stages.includes(3)) {
        log('━━━ Stage 3: 호갱노노 크롤링 결과 활용 (confidence: 0.9) ━━━');

        let hogangResults = [];
        if (fs.existsSync(HOGANG_RESULTS_FILE)) {
            hogangResults = JSON.parse(fs.readFileSync(HOGANG_RESULTS_FILE, 'utf8'));
            log(`   호갱노노 결과 파일 로드: ${hogangResults.length}건`);
        } else {
            log('   ⚠️ 호갱노노 크롤링 결과 없음 (21_crawl_hogang_missing.js 먼저 실행 필요)');
        }

        const hogangMap = new Map();
        for (const h of hogangResults) {
            if (h.hogang) {
                hogangMap.set(`${h.aptNm}__${h.sggCd}__${h.umdNm}`, h);
            }
        }

        for (const apt of unmapped) {
            if (apt._mapped) continue;

            const key = `${apt.aptNm}__${apt.sggCd}__${apt.umdNm}`;
            const hogangData = hogangMap.get(key);

            if (hogangData?.hogang && hogangData.hogang.matchScore >= 50) {
                const hogangName = hogangData.hogang.name;
                const noSpaceName = (hogangName || '').replace(/\s+/g, '').toLowerCase();
                const candidates = basicByNormName.get(noSpaceName) || basicByNormName.get(normalizeAptName(hogangName)) || [];

                const match = candidates[0];
                if (match) {
                    apt._mapped = true;
                    stats.stage3++;
                    newMappings.push({
                        apt, kaptCode: match.kaptCode, kaptName: match.kaptName,
                        type: 'hogang', conf: 0.9
                    });
                }
            }
        }
        log(`   ✅ Stage 3 매핑: ${stats.stage3}건`);
    }

    // ━━━ Stage 4: 지번 기반 매칭 (confidence: 0.85) ━━━
    if (stages.includes(4)) {
        log('━━━ Stage 4: 지번 기반 매칭 (confidence: 0.85) ━━━');

        for (const apt of unmapped) {
            if (apt._mapped) continue;
            if (!apt.jibun) continue;

            const jibun = apt.jibun.split(',')[0]?.trim();
            if (!jibun) continue;

            const addrCandidates = basicByAddr.get(apt.umdNm) || [];
            const jibunMatches = addrCandidates.filter(b => (b.kaptAddr || '').includes(jibun));

            if (jibunMatches.length === 1) {
                apt._mapped = true;
                stats.stage4++;
                newMappings.push({
                    apt, kaptCode: jibunMatches[0].kaptCode, kaptName: jibunMatches[0].kaptName,
                    type: 'jibun', conf: 0.85
                });
            } else if (jibunMatches.length > 1) {
                const nameMatched = jibunMatches.find(m =>
                    normalizeAptName(m.kaptName).includes(normalizeAptName(apt.aptNm).slice(0, 3))
                );
                if (nameMatched) {
                    apt._mapped = true;
                    stats.stage4++;
                    newMappings.push({
                        apt, kaptCode: nameMatched.kaptCode, kaptName: nameMatched.kaptName,
                        type: 'jibun_name', conf: 0.8
                    });
                }
            }
        }
        log(`   ✅ Stage 4 매핑: ${stats.stage4}건`);
    }

    // ━━━ Stage 5: 카카오 키워드 검색 (confidence: 0.8) ━━━
    if (stages.includes(5)) {
        log('━━━ Stage 5: 카카오 키워드 검색 (confidence: 0.8) ━━━');

        const KAKAO_KEY = kakaoKey || process.env.KAKAO_REST_API_KEY;
        if (!KAKAO_KEY) {
            log('   ⚠️ KAKAO_REST_API_KEY 없음, Stage 5 스킵');
        } else {
            const remaining = unmapped.filter(a => !a._mapped);
            const stage5Targets = remaining.slice(0, kakaoLimit);
            let processed = 0;

            for (const apt of stage5Targets) {
                processed++;
                if (processed % 50 === 0) {
                    process.stdout.write(`\r   진행: ${processed}/${stage5Targets.length}`);
                }

                try {
                    const query = `${apt.umdNm} ${apt.aptNm} 아파트`;
                    const res = await fetch(
                        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&category_group_code=`,
                        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
                    );
                    const responseData = await res.json();

                    if (responseData.documents?.length > 0) {
                        const kakaoName = responseData.documents[0].place_name
                            .replace(/아파트$/, '').replace(/\s+/g, '').trim().toLowerCase();

                        const candidates = basicByNormName.get(kakaoName) || basicByNormName.get(normalizeAptName(kakaoName)) || [];
                        if (candidates.length > 0) {
                            apt._mapped = true;
                            stats.stage5++;
                            newMappings.push({
                                apt, kaptCode: candidates[0].kaptCode, kaptName: candidates[0].kaptName,
                                type: 'kakao', conf: 0.8
                            });
                        }
                    }
                    await sleep(100);
                } catch (e) {
                    stats.errors++;
                }
            }
            if (stage5Targets.length > 0) {
                process.stdout.write('\n');
            }
            log(`   ✅ Stage 5 매핑: ${stats.stage5}건`);
        }
    }

    const unmappedRemaining = unmapped.filter(a => !a._mapped);

    return { newMappings, stats, unmappedRemaining };
}

// ══════════════════════════════════════════════════
// DB 반영
// ══════════════════════════════════════════════════

/**
 * mapping_type ENUM 매핑
 */
function typeToEnum(t) {
    const map = {
        exact: 'exact', normalized: 'normalized',
        hogang: 'address', jibun: 'address', jibun_name: 'address', kakao: 'address'
    };
    return map[t] || 'address';
}

/**
 * 매핑 결과를 DB에 반영
 * @param {Array} newMappings - runMappingPipeline()의 결과
 * @param {boolean} dryRun - true면 DB에 반영하지 않음
 * @returns {Promise<number>} 삽입된 건수
 */
export async function applyMappings(newMappings, dryRun = false) {
    if (dryRun || newMappings.length === 0) {
        if (dryRun && newMappings.length > 0) {
            log(`📋 DRY-RUN: ${newMappings.length}건 미반영`);
        }
        return 0;
    }

    log(`🔄 DB에 ${newMappings.length}건 INSERT 중...`);
    let inserted = 0;
    let errors = 0;
    let firstError = null;

    for (const m of newMappings) {
        try {
            await executeQuery(`
                INSERT INTO apt_name_mapping (deal_apt_name, sgg_cd, umd_nm, kapt_code, basis_apt_name, mapping_type, confidence_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    kapt_code = IF(VALUES(confidence_score) > confidence_score, VALUES(kapt_code), kapt_code),
                    basis_apt_name = IF(VALUES(confidence_score) > confidence_score, VALUES(basis_apt_name), basis_apt_name),
                    confidence_score = IF(VALUES(confidence_score) > confidence_score, VALUES(confidence_score), confidence_score),
                    mapping_type = IF(VALUES(confidence_score) > confidence_score, VALUES(mapping_type), mapping_type),
                    updated_at = NOW()
            `, [m.apt.aptNm, m.apt.sggCd, m.apt.umdNm, m.kaptCode, m.kaptName, typeToEnum(m.type), m.conf]);
            inserted++;
        } catch (e) {
            errors++;
            if (!firstError) firstError = e.message;
        }
    }
    log(`   ✅ ${inserted}건 INSERT 완료`);
    if (errors > 0) {
        logWarning(`   ⚠️ ${errors}건 INSERT 실패 (첫 번째 에러: ${firstError})`);
    }

    // apt_search_index에도 kapt_code 동기화
    try {
        const syncResult = await executeQuery(`
            UPDATE apt_search_index si
            INNER JOIN apt_name_mapping m ON 
                si.aptNm COLLATE utf8mb4_unicode_ci = m.deal_apt_name COLLATE utf8mb4_unicode_ci
                AND si.sggCd = m.sgg_cd
                AND si.umdNm COLLATE utf8mb4_unicode_ci = m.umd_nm COLLATE utf8mb4_unicode_ci
            SET si.kapt_code = m.kapt_code
            WHERE si.kapt_code IS NULL OR si.kapt_code = 'UNMAPPED' OR si.kapt_code = ''
        `);
        log(`   🔗 apt_search_index kapt_code 동기화: ${syncResult.affectedRows}건`);
    } catch (e) {
        logWarning(`   apt_search_index 동기화 오류: ${e.message}`);
    }

    return inserted;
}

// ══════════════════════════════════════════════════
// K-apt 미등록 단지 처리
// ══════════════════════════════════════════════════

/**
 * K-apt에 등록되지 않은 단지를 apt_basic_info에 가상 레코드로 생성
 * 카카오 지오코딩으로 좌표 확보
 * 
 * @param {Array} unmappedRemaining - 파이프라인 후 미매핑 잔여 단지
 * @param {Object} options
 * @param {string} options.kakaoKey - 카카오 API 키
 * @param {number} options.limit - 최대 처리 건수 (기본: 100)
 * @returns {Promise<{created: number, mapped: number}>}
 */
export async function registerUnmappedToBasicInfo(unmappedRemaining, options = {}) {
    const { kakaoKey, limit = 100 } = options;
    const KAKAO_KEY = kakaoKey || process.env.KAKAO_REST_API_KEY;

    if (!KAKAO_KEY) {
        logWarning('KAKAO_REST_API_KEY 없음, K-apt 미등록 단지 처리 스킵');
        return { created: 0, mapped: 0 };
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 거래량 상위 단지부터 처리
    const targets = unmappedRemaining
        .filter(a => a.dealCount >= 5) // 최소 5건 이상 거래된 단지만
        .slice(0, limit);

    log(`🏗️ K-apt 미등록 단지 가상 레코드 생성: ${targets.length}건 대상`);

    let created = 0;
    let mapped = 0;

    for (const apt of targets) {
        try {
            // 카카오 키워드 검색으로 좌표 및 주소 확보
            const query = `${apt.umdNm} ${apt.aptNm} 아파트`;
            const res = await fetch(
                `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=3`,
                { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
            );
            const data = await res.json();

            if (data.documents?.length > 0) {
                const doc = data.documents.find(d => d.category_name?.includes('아파트')) || data.documents[0];
                const lat = parseFloat(doc.y);
                const lng = parseFloat(doc.x);
                const address = doc.road_address_name || doc.address_name || '';

                if (lat && lng) {
                    // 가상 kaptCode 생성 (VIRTUAL_ prefix로 구분)
                    const virtualCode = `VIRTUAL_${apt.sggCd}_${crypto.randomUUID().slice(0, 8)}`;

                    // apt_basic_info에 삽입
                    await executeQuery(`
                        INSERT INTO apt_basic_info (kaptCode, kaptName, kaptAddr, latitude, longitude, kaptdaCnt)
                        VALUES (?, ?, ?, ?, ?, 0)
                        ON DUPLICATE KEY UPDATE kaptName = kaptName
                    `, [virtualCode, apt.aptNm, address, lat, lng]);

                    // apt_name_mapping에도 매핑 생성
                    await executeQuery(`
                        INSERT INTO apt_name_mapping (deal_apt_name, sgg_cd, umd_nm, kapt_code, basis_apt_name, mapping_type, confidence_score)
                        VALUES (?, ?, ?, ?, ?, 'address', 0.7)
                        ON DUPLICATE KEY UPDATE 
                            kapt_code = IF(kapt_code IS NULL OR kapt_code = '' OR kapt_code = 'UNMAPPED', VALUES(kapt_code), kapt_code)
                    `, [apt.aptNm, apt.sggCd, apt.umdNm, virtualCode, apt.aptNm]);

                    created++;
                    mapped++;
                }
            }
            await sleep(100);
        } catch (e) {
            logWarning(`   가상 레코드 생성 오류 (${apt.aptNm}): ${e.message}`);
        }
    }

    log(`   ✅ 가상 레코드 생성: ${created}건, 매핑: ${mapped}건`);
    return { created, mapped };
}

/**
 * 매핑 통계 요약 로그 출력
 */
export function printMappingStats(stats, unmappedCount) {
    const totalMapped = stats.stage1 + stats.stage2 + stats.stage2_5 + stats.stage3 + stats.stage4 + stats.stage5;

    log('');
    log('═══════════════════════════════════════════');
    log('  📊 매핑 파이프라인 결과');
    log('═══════════════════════════════════════════');
    log(`  Stage 1 (정확 일치):    ${stats.stage1}건`);
    log(`  Stage 2 (정규화):       ${stats.stage2}건`);
    log(`  Stage 2.5 (순서뒤바뀜): ${stats.stage2_5}건`);
    log(`  Stage 3 (호갱노노):     ${stats.stage3}건`);
    log(`  Stage 4 (지번):         ${stats.stage4}건`);
    log(`  Stage 5 (카카오):       ${stats.stage5}건`);
    log(`  ────────────────────────────`);
    log(`  총 매핑:                ${totalMapped}건`);
    log(`  미매핑 잔여:            ${unmappedCount}건`);
    log(`  오류:                   ${stats.errors}건`);
    log('═══════════════════════════════════════════');
}
