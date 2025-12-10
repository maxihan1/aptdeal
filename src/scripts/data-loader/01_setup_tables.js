/**
 * 01_setup_tables.js
 * 데이터 적재에 필요한 테이블 생성
 * 
 * 실행: node src/scripts/data-loader/01_setup_tables.js
 */

import { executeQuery, testConnection, closeConnection } from './utils/db.js';
import { log, logError, logSuccess, logSection } from './utils/logger.js';

// 테이블 생성 SQL
const CREATE_TABLES = {
    // 1. 진행 상황 테이블
    data_load_progress: `
    CREATE TABLE IF NOT EXISTS data_load_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_type ENUM('deal', 'rent') NOT NULL COMMENT '데이터 유형 (매매/전월세)',
      year INT NOT NULL COMMENT '연도',
      month INT NOT NULL COMMENT '월',
      region_code VARCHAR(10) NOT NULL COMMENT '법정동 코드',
      region_name VARCHAR(100) COMMENT '지역명',
      status ENUM('pending', 'in_progress', 'completed', 'failed', 'mismatch') DEFAULT 'pending' COMMENT '상태',
      api_response_count INT DEFAULT 0 COMMENT 'API 응답 건수',
      db_record_count INT DEFAULT 0 COMMENT 'DB 적재 건수',
      page_count INT DEFAULT 0 COMMENT '처리한 페이지 수',
      error_message TEXT COMMENT '에러 메시지',
      started_at DATETIME COMMENT '시작 시간',
      completed_at DATETIME COMMENT '완료 시간',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_progress (data_type, year, month, region_code),
      INDEX idx_status (status),
      INDEX idx_year_month (year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='데이터 적재 진행 상황 추적 테이블'
  `,

    // 2. 실패 요청 테이블 (Dead Letter Queue)
    failed_requests: `
    CREATE TABLE IF NOT EXISTS failed_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_type ENUM('deal', 'rent') NOT NULL COMMENT '데이터 유형',
      year INT NOT NULL COMMENT '연도',
      month INT NOT NULL COMMENT '월',
      region_code VARCHAR(10) NOT NULL COMMENT '법정동 코드',
      region_name VARCHAR(100) COMMENT '지역명',
      page_no INT DEFAULT 1 COMMENT '실패한 페이지 번호',
      error_code VARCHAR(50) COMMENT '에러 코드',
      error_message TEXT COMMENT '에러 메시지',
      retry_count INT DEFAULT 0 COMMENT '재시도 횟수',
      resolved BOOLEAN DEFAULT FALSE COMMENT '해결 여부',
      resolved_at DATETIME COMMENT '해결 시간',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_unresolved (resolved, data_type),
      INDEX idx_region_date (region_code, year, month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='실패한 API 요청 추적 테이블 (Dead Letter Queue)'
  `,

    // 3. 데이터 검증 결과 테이블
    data_audit: `
    CREATE TABLE IF NOT EXISTS data_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_type ENUM('deal', 'rent') NOT NULL COMMENT '데이터 유형',
      year INT NOT NULL COMMENT '연도',
      month INT NOT NULL COMMENT '월',
      region_code VARCHAR(10) NOT NULL COMMENT '법정동 코드',
      region_name VARCHAR(100) COMMENT '지역명',
      api_count INT NOT NULL COMMENT 'API 총 건수',
      db_count INT NOT NULL COMMENT 'DB 적재 건수',
      missing_count INT GENERATED ALWAYS AS (api_count - db_count) STORED COMMENT '누락 건수',
      status ENUM('match', 'mismatch', 'recovering', 'resolved') DEFAULT 'match' COMMENT '상태',
      audited_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '검증 시간',
      resolved_at DATETIME COMMENT '해결 시간',
      UNIQUE KEY uk_audit (data_type, year, month, region_code),
      INDEX idx_mismatch (status, data_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='데이터 검증 결과 테이블'
  `,

    // 4. 매매 실거래가 테이블 (이미 존재할 수 있음)
    apt_deal_info: `
    CREATE TABLE IF NOT EXISTS apt_deal_info (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      deal_id VARCHAR(100) UNIQUE COMMENT '거래 고유 ID (중복 방지용)',
      region_code VARCHAR(10) COMMENT '지역 코드',
      sido VARCHAR(50) COMMENT '시도',
      sigungu VARCHAR(50) COMMENT '시군구',
      umd_nm VARCHAR(50) COMMENT '법정동명',
      jibun VARCHAR(50) COMMENT '지번',
      road_nm VARCHAR(100) COMMENT '도로명',
      road_nm_bonbun VARCHAR(20) COMMENT '도로명건물본번호',
      road_nm_bubun VARCHAR(20) COMMENT '도로명건물부번호',
      apt_nm VARCHAR(100) COMMENT '아파트명',
      kapt_name VARCHAR(100) COMMENT '아파트명 (kaptName)',
      exclu_use_ar DECIMAL(10,2) COMMENT '전용면적',
      deal_year INT COMMENT '거래년도',
      deal_month INT COMMENT '거래월',
      deal_day INT COMMENT '거래일',
      deal_amount BIGINT COMMENT '거래금액 (만원)',
      floor INT COMMENT '층',
      build_year INT COMMENT '건축년도',
      apt_seq VARCHAR(50) COMMENT '아파트 일련번호',
      cdeal_type VARCHAR(20) COMMENT '해제여부 (O: 해제)',
      cdeal_day VARCHAR(20) COMMENT '해제사유발생일',
      dealer_lawdnm VARCHAR(100) COMMENT '중개사소재지',
      rgst_date VARCHAR(20) COMMENT '등기일자',
      sler_gbn VARCHAR(20) COMMENT '매도/매수자구분',
      buyer_gbn VARCHAR(20) COMMENT '매수자유형',
      land_leas_hold_gbn VARCHAR(20) COMMENT '토지임대부 여부',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_region (region_code),
      INDEX idx_apt_name (apt_nm),
      INDEX idx_kapt_name (kapt_name),
      INDEX idx_deal_date (deal_year, deal_month),
      INDEX idx_area (exclu_use_ar)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='아파트 매매 실거래가 정보'
  `,

    // 5. 전월세 실거래가 테이블 (이미 존재할 수 있음)
    apt_rent_info: `
    CREATE TABLE IF NOT EXISTS apt_rent_info (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      rent_id VARCHAR(100) UNIQUE COMMENT '거래 고유 ID (중복 방지용)',
      region_code VARCHAR(10) COMMENT '지역 코드',
      sido VARCHAR(50) COMMENT '시도',
      sigungu VARCHAR(50) COMMENT '시군구',
      umd_nm VARCHAR(50) COMMENT '법정동명',
      jibun VARCHAR(50) COMMENT '지번',
      apt_nm VARCHAR(100) COMMENT '아파트명',
      kapt_name VARCHAR(100) COMMENT '아파트명 (kaptName)',
      exclu_use_ar DECIMAL(10,2) COMMENT '전용면적',
      deal_year INT COMMENT '거래년도',
      deal_month INT COMMENT '거래월',
      deal_day INT COMMENT '거래일',
      deposit BIGINT COMMENT '보증금 (만원)',
      monthly_rent BIGINT COMMENT '월세 (만원)',
      floor INT COMMENT '층',
      build_year INT COMMENT '건축년도',
      contract_type VARCHAR(20) COMMENT '신규/갱신 여부',
      contract_term VARCHAR(50) COMMENT '계약기간',
      prev_deposit BIGINT COMMENT '종전 보증금',
      prev_monthly_rent BIGINT COMMENT '종전 월세',
      use_rr_right VARCHAR(10) COMMENT '계약갱신청구권사용',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_region (region_code),
      INDEX idx_apt_name (apt_nm),
      INDEX idx_kapt_name (kapt_name),
      INDEX idx_deal_date (deal_year, deal_month),
      INDEX idx_area (exclu_use_ar)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='아파트 전월세 실거래가 정보'
  `,
};

async function main() {
    logSection('데이터 적재 테이블 생성');

    // 연결 테스트
    const connected = await testConnection();
    if (!connected) {
        logError('데이터베이스 연결에 실패했습니다.');
        process.exit(1);
    }

    // 테이블 생성
    for (const [tableName, sql] of Object.entries(CREATE_TABLES)) {
        try {
            log(`📋 테이블 생성 중: ${tableName}`);
            await executeQuery(sql);
            logSuccess(`테이블 생성 완료: ${tableName}`);
        } catch (error) {
            logError(`테이블 생성 실패: ${tableName}`, error.message);
        }
    }

    // 기존 테이블 확인
    log('\n📊 테이블 현황:');
    const tables = await executeQuery(`
    SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME IN ('data_load_progress', 'failed_requests', 'data_audit', 'apt_deal_info', 'apt_rent_info')
  `);

    tables.forEach(table => {
        console.log(`   - ${table.TABLE_NAME}: ${table.TABLE_ROWS || 0}건 (${table.TABLE_COMMENT || ''})`);
    });

    await closeConnection();
    logSuccess('\n테이블 설정이 완료되었습니다!');
}

main().catch(error => {
    logError('스크립트 실행 실패:', error);
    process.exit(1);
});
