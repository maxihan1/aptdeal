
import { executeQuery, closeConnection } from './utils/db.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function restore() {
    console.log("Restoring manual data with safe custom code...");

    // 1. 잘못된 코드(평택 대진아파트 코드) 삭제
    await executeQuery("DELETE FROM apt_basic_info WHERE kaptCode = 'A10020533'");
    await executeQuery("DELETE FROM apt_detail_info WHERE kaptCode = 'A10020533'");
    console.log("Deleted A10020533 (Pyeongtaek code)");

    // 2. 안전한 임시 코드로 다시 삽입
    const safeCode = 'A13511401'; // 성남분당구(135) 대장동(114) 임시(01)

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

    await executeQuery(basicQuery, [
        safeCode,
        '판교더샵포레스트11단지',
        448,
        7,
        '20210531',
        '(주)포스코건설',
        '지역난방',
        '계단식',
        '경기도 성남시 분당구 판교대장로5길 58'
    ]);

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
        safeCode,
        '0',
        '605',
        '5분이내',
        '15분이내',
        '',
        ''
    ]);
    
    console.log(`✅ Restored with safe code: ${safeCode}`);
    await closeConnection();
}

restore();
