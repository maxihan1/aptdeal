
import { executeQuery, closeConnection } from './utils/db.js';
import { logSuccess, logError } from './utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    try {
        console.log("🛠️ Manually inserting '판교더샵포레스트11단지' data...");

        // 1. apt_basic_info 삽입
        const basicQuery = `
            INSERT INTO apt_basic_info 
            (kaptCode, kaptName, kaptdaCnt, kaptDongCnt, kaptUsedate, kaptBcompany, codeHeatNm, codeHallNm, kaptAddr)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            kaptName=VALUES(kaptName),
            kaptdaCnt=VALUES(kaptdaCnt),
            kaptDongCnt=VALUES(kaptDongCnt),
            kaptUsedate=VALUES(kaptUsedate),
            kaptBcompany=VALUES(kaptBcompany),
            codeHeatNm=VALUES(codeHeatNm),
            codeHallNm=VALUES(codeHallNm),
            kaptAddr=VALUES(kaptAddr)
        `;

        // 임의의 kaptCode 사용 (충돌 방지 위해 접두어 사용)
        const kaptCode = 'A13511401';

        await executeQuery(basicQuery, [
            kaptCode,
            '판교더샵포레스트11단지',
            448,
            7,
            '20210531',
            '(주)포스코건설',
            '지역난방',
            '계단식',
            '경기도 성남시 분당구 판교대장로5길 58'
        ]);

        console.log("✅ Basic info inserted.");

        // 2. apt_detail_info 삽입 (주차 등)
        // kaptdEcntp 컬럼 없음 -> Pcnt + Pcntu 로 계산됨 (API에서)
        const detailQuery = `
            INSERT INTO apt_detail_info
            (kaptCode, kaptdPcnt, kaptdPcntu, kaptdWtimebus, kaptdWtimesub, subwayLine, subwayStation)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            kaptdPcnt=VALUES(kaptdPcnt),
            kaptdPcntu=VALUES(kaptdPcntu),
            kaptdWtimebus=VALUES(kaptdWtimebus),
            kaptdWtimesub=VALUES(kaptdWtimesub)
        `;

        await executeQuery(detailQuery, [
            kaptCode,
            '0',   // 지상 (문자열 타입인 경우도 고려)
            '605', // 지하
            '5분이내',
            '15분이내',
            '',
            ''
        ]);

        console.log("✅ Detail info inserted.");
        logSuccess("Successfully recovered '판교더샵포레스트11단지' data.");

    } catch (e) {
        logError("Manual insertion failed:", e.message);
    }
    await closeConnection();
}

main();
