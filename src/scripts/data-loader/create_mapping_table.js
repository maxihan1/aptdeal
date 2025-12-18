
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError, logSection } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS apt_name_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- 실거래가 식별자
  deal_aptNm VARCHAR(100) NOT NULL COMMENT '실거래가 아파트명',
  deal_sggCd VARCHAR(10) NOT NULL COMMENT '시군구 코드',
  deal_umdNm VARCHAR(50) NOT NULL COMMENT '법정동/읍면리',
  
  -- K-apt 식별자 (매핑 대상)
  kaptCode VARCHAR(20) NOT NULL COMMENT 'K-apt 단지코드',
  
  -- 매핑 상태
  mapping_type ENUM('auto', 'manual') DEFAULT 'auto' COMMENT '매핑 유형',
  confidence DECIMAL(3,2) DEFAULT 1.00 COMMENT '자동 매핑 신뢰도',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_deal (deal_aptNm, deal_sggCd, deal_umdNm),
  INDEX idx_kaptCode (kaptCode),
  INDEX idx_sggCd (deal_sggCd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='실거래가 아파트명 → K-apt 단지코드 매핑 테이블';
`;

async function main() {
    logSection("Creating apt_name_mapping table");

    try {
        await executeQuery(CREATE_TABLE_SQL);
        logSuccess("Table 'apt_name_mapping' created successfully!");
    } catch (e) {
        logError("Failed to create table:", e.message);
    }

    await closeConnection();
}

main();
