/**
 * 22_auto_mapping_pipeline.js
 * 
 * 5단계 자동 매핑 파이프라인 (메모리 기반 고속 매칭)
 * 
 * sync_mapping.js 모듈을 활용하여 매핑 파이프라인을 실행합니다.
 * CLI에서 독립 실행 가능하며, --dry-run 및 --stage 옵션을 지원합니다.
 * 
 * 1단계: 정확한 이름 일치 (confidence: 1.0)
 * 2단계: 정규화 이름 매칭 (confidence: 0.95)
 * 3단계: 호갱노노 크롤링 결과 활용 (confidence: 0.9)
 * 4단계: 지번 기반 매칭 (confidence: 0.85)
 * 5단계: 카카오 키워드 검색 (confidence: 0.8)
 * 
 * 실행:
 *   node src/scripts/data-loader/22_auto_mapping_pipeline.js [--dry-run] [--stage=1,2,3]
 */

import { closeConnection } from './utils/db.js';
import {
    loadMappingData,
    runMappingPipeline,
    applyMappings,
    printMappingStats,
} from './sync_mapping.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const MAPPING_LOG_FILE = path.join(__dirname, 'logs', `mapping_log_${new Date().toISOString().slice(0, 10)}.json`);

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const stagesArg = args.find(a => a.startsWith('--stage='))?.split('=')[1];
    const enabledStages = stagesArg ? stagesArg.split(',').map(Number) : [1, 2, 3, 4, 5];

    console.log('=============================================================');
    console.log('  🔗 자동 매핑 파이프라인 (메모리 기반 고속 매칭)');
    console.log(`  모드: ${dryRun ? '🧪 DRY-RUN (DB 미반영)' : '🚀 APPLY (DB 반영)'}`);
    console.log(`  활성 단계: ${enabledStages.join(', ')}`);
    console.log('=============================================================\n');

    // ── 데이터 로드 (메모리) ─────────────────────────────
    const data = await loadMappingData();

    // ── 파이프라인 실행 ──────────────────────────────────
    const { newMappings, stats, unmappedRemaining } = await runMappingPipeline(data, {
        stages: enabledStages,
        kakaoLimit: 200,
        kakaoKey: process.env.KAKAO_REST_API_KEY,
    });

    // ── DB INSERT ────────────────────────────────────────
    if (!dryRun) {
        await applyMappings(newMappings, false);
    } else if (newMappings.length > 0) {
        console.log('\n📋 DRY-RUN 매핑 미리보기 (상위 30건):\n');
        newMappings.slice(0, 30).forEach(m => {
            console.log(`   [${m.type}] ${m.apt.aptNm} → ${m.kaptName} (${m.kaptCode}, conf: ${m.conf}, 거래 ${m.apt.dealCount}건)`);
        });
        if (newMappings.length > 30) console.log(`   ... 외 ${newMappings.length - 30}건`);
    }

    // ── 매핑 로그 저장 ───────────────────────────────────
    const mappingLog = newMappings.map(m => ({
        stage: m.type,
        dealName: m.apt.aptNm,
        umdNm: m.apt.umdNm,
        sggCd: m.apt.sggCd,
        dealCount: m.apt.dealCount,
        mappedTo: m.kaptName,
        kaptCode: m.kaptCode,
        confidence: m.conf,
    }));

    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(MAPPING_LOG_FILE, JSON.stringify(mappingLog, null, 2), 'utf8');
    console.log(`\n📝 매핑 로그 저장: ${MAPPING_LOG_FILE}`);

    // ── 결과 요약 ─────────────────────────────────────
    printMappingStats(stats, unmappedRemaining.length);

    if (dryRun) {
        console.log('  💡 실제 반영: node src/scripts/data-loader/22_auto_mapping_pipeline.js (--dry-run 제거)\n');
    } else {
        console.log('  💡 다음 단계: node src/scripts/data-loader/06_daily_sync.js --mode=weekly (캐시 갱신)\n');
    }

    await closeConnection();
}

main().catch(err => {
    console.error('스크립트 오류:', err);
    process.exit(1);
});
