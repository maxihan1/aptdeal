/**
 * migrate_mapping_columns.js
 * 
 * apt_name_mapping 테이블 스키마 마이그레이션
 * 
 * 기존 컬럼명 → 새 컬럼명:
 *   deal_aptNm       → deal_apt_name
 *   deal_sggCd       → sgg_cd
 *   deal_umdNm       → umd_nm
 *   kaptCode          → kapt_code
 *   (새 컬럼)         → basis_apt_name
 *   mapping_type ENUM → mapping_type VARCHAR(20)
 *   confidence         → confidence_score
 * 
 * 안전하게 IF NOT EXISTS / IF EXISTS 체크 후 실행
 * 
 * 실행:
 *   node src/scripts/data-loader/migrate_mapping_columns.js [--dry-run]
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    console.log('=============================================================');
    console.log('  🔄 apt_name_mapping 스키마 마이그레이션');
    console.log(`  모드: ${DRY_RUN ? '🧪 DRY-RUN' : '🚀 APPLY'}`);
    console.log('=============================================================\n');

    const connected = await testConnection();
    if (!connected) {
        console.error('❌ DB 연결 실패');
        process.exit(1);
    }

    // 현재 테이블 구조 확인
    const columns = await executeQuery(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'apt_name_mapping'
        ORDER BY ORDINAL_POSITION
    `);

    if (columns.length === 0) {
        console.log('ℹ️ apt_name_mapping 테이블이 존재하지 않습니다.');
        console.log('   create_mapping_table.js를 실행하여 새로 생성하세요.');
        await closeConnection();
        return;
    }

    const columnNames = columns.map(c => c.COLUMN_NAME);
    console.log('📋 현재 컬럼:', columnNames.join(', '));
    console.log('');

    const migrations = [];

    // ── 컬럼 이름 변경 ──────────────────────────────────

    // deal_aptNm → deal_apt_name
    if (columnNames.includes('deal_aptNm') && !columnNames.includes('deal_apt_name')) {
        migrations.push({
            desc: 'deal_aptNm → deal_apt_name',
            sql: `ALTER TABLE apt_name_mapping CHANGE COLUMN deal_aptNm deal_apt_name VARCHAR(100) NOT NULL COMMENT '실거래가 아파트명'`
        });
    }

    // deal_sggCd → sgg_cd
    if (columnNames.includes('deal_sggCd') && !columnNames.includes('sgg_cd')) {
        migrations.push({
            desc: 'deal_sggCd → sgg_cd',
            sql: `ALTER TABLE apt_name_mapping CHANGE COLUMN deal_sggCd sgg_cd VARCHAR(10) NOT NULL COMMENT '시군구 코드'`
        });
    }

    // deal_umdNm → umd_nm
    if (columnNames.includes('deal_umdNm') && !columnNames.includes('umd_nm')) {
        migrations.push({
            desc: 'deal_umdNm → umd_nm',
            sql: `ALTER TABLE apt_name_mapping CHANGE COLUMN deal_umdNm umd_nm VARCHAR(50) NOT NULL COMMENT '법정동/읍면리'`
        });
    }

    // kaptCode → kapt_code
    if (columnNames.includes('kaptCode') && !columnNames.includes('kapt_code')) {
        migrations.push({
            desc: 'kaptCode → kapt_code',
            sql: `ALTER TABLE apt_name_mapping CHANGE COLUMN kaptCode kapt_code VARCHAR(20) NOT NULL COMMENT 'K-apt 단지코드'`
        });
    }

    // confidence → confidence_score
    if (columnNames.includes('confidence') && !columnNames.includes('confidence_score')) {
        migrations.push({
            desc: 'confidence → confidence_score',
            sql: `ALTER TABLE apt_name_mapping CHANGE COLUMN confidence confidence_score DECIMAL(3,2) DEFAULT 1.00 COMMENT '자동 매핑 신뢰도'`
        });
    }

    // ── mapping_type ENUM → VARCHAR ─────────────────────

    const mappingTypeCol = columns.find(c => c.COLUMN_NAME === 'mapping_type');
    if (mappingTypeCol && mappingTypeCol.COLUMN_TYPE.includes('enum')) {
        migrations.push({
            desc: 'mapping_type ENUM → VARCHAR(20)',
            sql: `ALTER TABLE apt_name_mapping MODIFY COLUMN mapping_type VARCHAR(20) DEFAULT 'auto' COMMENT '매핑 유형 (exact, normalized, address, manual)'`
        });
    }

    // ── 새 컬럼 추가: basis_apt_name ────────────────────

    if (!columnNames.includes('basis_apt_name')) {
        migrations.push({
            desc: 'basis_apt_name 컬럼 추가',
            sql: `ALTER TABLE apt_name_mapping ADD COLUMN basis_apt_name VARCHAR(100) DEFAULT NULL COMMENT 'K-apt 기준 아파트명' AFTER kapt_code`
        });
    }

    // ── 인덱스 업데이트 ─────────────────────────────────

    // 기존 인덱스 확인
    const indexes = await executeQuery(`
        SHOW INDEX FROM apt_name_mapping
    `);
    const indexNames = [...new Set(indexes.map(i => i.Key_name))];

    // 기존 UNIQUE KEY가 이전 컬럼명을 사용하는 경우 재생성
    const ukDeal = indexes.find(i => i.Key_name === 'uk_deal');
    if (ukDeal) {
        // uk_deal이 존재하면 새 컬럼명에 맞게 재생성 (컬럼 변경 후 자동으로 맞춰짐)
        // MySQL은 RENAME COLUMN 시 인덱스도 자동 업데이트하므로 별도 작업 불필요
        console.log('   ℹ️ uk_deal 인덱스: RENAME COLUMN 시 자동 업데이트됨');
    }

    // ── 실행 ────────────────────────────────────────────

    if (migrations.length === 0) {
        console.log('✅ 마이그레이션 불필요 — 테이블이 이미 최신 스키마입니다.\n');
        await closeConnection();
        return;
    }

    console.log(`📝 ${migrations.length}개 마이그레이션 발견:\n`);
    migrations.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.desc}`);
        if (DRY_RUN) console.log(`      SQL: ${m.sql}`);
    });
    console.log('');

    if (DRY_RUN) {
        console.log('🧪 DRY-RUN 모드 — DB에 반영되지 않았습니다.');
        console.log('   실제 반영: node src/scripts/data-loader/migrate_mapping_columns.js\n');
        await closeConnection();
        return;
    }

    let success = 0;
    let failed = 0;

    for (const m of migrations) {
        try {
            console.log(`   🔄 실행 중: ${m.desc}...`);
            await executeQuery(m.sql);
            console.log(`   ✅ 완료: ${m.desc}`);
            success++;
        } catch (e) {
            console.error(`   ❌ 실패: ${m.desc} — ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=============================================================`);
    console.log(`  📊 마이그레이션 결과: 성공 ${success}, 실패 ${failed}`);
    console.log(`=============================================================\n`);

    // 최종 컬럼 확인
    if (success > 0) {
        const newColumns = await executeQuery(`
            SELECT COLUMN_NAME, COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'apt_name_mapping'
            ORDER BY ORDINAL_POSITION
        `);
        console.log('📋 변경 후 컬럼:');
        newColumns.forEach(c => console.log(`   - ${c.COLUMN_NAME} (${c.COLUMN_TYPE})`));
    }

    await closeConnection();
}

main().catch(err => {
    console.error('스크립트 오류:', err);
    process.exit(1);
});
