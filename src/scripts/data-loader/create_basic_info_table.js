
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const createTableSQL = `
CREATE TABLE IF NOT EXISTS apt_basic_info (
  kaptCode VARCHAR(20) PRIMARY KEY COMMENT '단지코드',
  kaptName VARCHAR(100) COMMENT '단지명',
  kaptdaCnt INT COMMENT '세대수',
  kaptDongCnt INT COMMENT '동수',
  kaptUsedate VARCHAR(20) COMMENT '사용승인일',
  kaptBcompany VARCHAR(100) COMMENT '시공사',
  codeHeatNm VARCHAR(50) COMMENT '난방방식',
  codeHallNm VARCHAR(50) COMMENT '복도유형',
  kaptAddr VARCHAR(200) COMMENT '주소',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kaptName (kaptName),
  INDEX idx_kaptAddr (kaptAddr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// 상세 정보 테이블도 필요할 수 있음
const createDetailTableSQL = `
CREATE TABLE IF NOT EXISTS apt_detail_info (
  kaptCode VARCHAR(20) PRIMARY KEY,
  kaptdPcnt INT COMMENT '지상주차',
  kaptdPcntu INT COMMENT '지하주차',
  kaptdEcntp INT COMMENT '총주차대수',
  kaptdWtimebus VARCHAR(50) COMMENT '버스도보시간',
  kaptdWtimesub VARCHAR(50) COMMENT '지하철도보시간',
  subwayLine VARCHAR(50) COMMENT '지하철호선',
  subwayStation VARCHAR(50) COMMENT '지하철역',
  educationFacility TEXT COMMENT '교육시설',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function main() {
    try {
        console.log("Creating tables...");
        await executeQuery(createTableSQL);
        await executeQuery(createDetailTableSQL);
        logSuccess("Tables created successfully.");
    } catch (e) {
        logError("Table creation failed:", e.message);
    }
    await closeConnection();
}

main();
