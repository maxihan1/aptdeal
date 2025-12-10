
import { executeQuery, closeConnection } from './data-loader/utils/db.js';

async function debugQuery() {
    const sido = '서울특별시';
    const sigungu = '강남구';
    const dong = '개포동';
    const startYear = 2025;
    const startMonth = 9;
    const startDay = 10;
    const endYear = 2025;
    const endMonth = 12;
    const endDay = 10;

    let query = `
      SELECT
        MAX(r.id) as id,
        r.aptNm,
        r.sggCd,
        r.umdNm,
        r.jibun,
        r.excluUseAr,
        r.deposit,
        r.monthlyRent,
        r.dealYear,
        r.dealMonth,
        r.dealDay,
        r.floor,
        r.buildYear,
        r.contractType,
        l.as1,
        l.as2,
        r.umdNm as as3
      FROM apt_rent_info r
      JOIN (
        SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2
        FROM apt_list
        WHERE as1 = ? AND as2 = ?
      ) l ON r.sggCd = l.sggCode
      WHERE (
          (r.dealYear > ? OR (r.dealYear = ? AND r.dealMonth > ?) OR (r.dealYear = ? AND r.dealMonth = ? AND r.dealDay >= ?))
          AND
          (r.dealYear < ? OR (r.dealYear = ? AND r.dealMonth < ?) OR (r.dealYear = ? AND r.dealMonth = ? AND r.dealDay <= ?))
        )
    `;

    const params = [
        sido, sigungu,
        startYear, startYear, startMonth, startYear, startMonth, startDay,
        endYear, endYear, endMonth, endYear, endMonth, endDay
    ];

    if (dong) {
        query += ' AND r.umdNm = ?';
        params.push(dong);
    }

    query += ' GROUP BY r.aptNm, r.sggCd, r.umdNm, r.jibun, r.excluUseAr, r.deposit, r.monthlyRent, r.dealYear, r.dealMonth, r.dealDay, r.floor, r.buildYear, r.contractType, l.as1, l.as2';
    query += ' ORDER BY r.dealYear DESC, r.dealMonth DESC, r.dealDay DESC LIMIT 5000';

    console.log('--- Executing Query ---');

    try {
        const rows = await executeQuery(query, params);
        console.log('Success! Rows found:', rows.length);
    } catch (error) {
        console.error('Query Failed!');
        console.error(error);
    } finally {
        await closeConnection();
    }
}

debugQuery();
