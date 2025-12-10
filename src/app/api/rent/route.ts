import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface RentRow {
    id: number;
    aptNm: string;
    sggCd: string;
    umdNm: string;
    jibun: string;
    excluUseAr: number;
    deposit: number;
    monthlyRent: number;
    dealYear: number;
    dealMonth: number;
    dealDay: number;
    floor: number;
    buildYear: number;
    contractType: string;
    as1: string;
    as2: string;
    as3: string;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sido = searchParams.get('sido');
        const sigungu = searchParams.get('sigungu');
        const dong = searchParams.get('dong');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        if (!sido || !sigungu || !startDate || !endDate) {
            return NextResponse.json(
                { error: '필수 파라미터가 누락되었습니다. (sido, sigungu, startDate, endDate)' },
                { status: 400 }
            );
        }

        // 날짜 파싱 - DATE 문자열로 변환
        const startDateStr = startDate; // YYYY-MM-DD 형식
        const endDateStr = endDate;

        // apt_list 테이블을 통해 지역명 → sggCd 매핑 후 apt_rent_info 조회
        // 최적화: DATE() 함수 대신 직접 비교, GROUP BY 제거
        let query = `
      SELECT
        r.id,
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
      WHERE CONCAT(r.dealYear, '-', LPAD(r.dealMonth, 2, '0'), '-', LPAD(r.dealDay, 2, '0')) >= ?
        AND CONCAT(r.dealYear, '-', LPAD(r.dealMonth, 2, '0'), '-', LPAD(r.dealDay, 2, '0')) <= ?
    `;

        const params: (string | number)[] = [
            sido, sigungu,
            startDateStr, endDateStr
        ];

        // 동 필터 (선택)
        if (dong && dong !== 'ALL' && dong !== '전체') {
            query += ' AND r.umdNm = ?';
            params.push(dong);
        }


        query += ' ORDER BY r.dealYear DESC, r.dealMonth DESC, r.dealDay DESC LIMIT 10000';

        const rows = await executeQuery(query, params) as RentRow[];

        // 프론트엔드 RentDeal 인터페이스에 맞게 변환
        const rentDeals = rows.map((row, index) => ({
            id: row.id?.toString() || `rent-${index}`,
            region: `${row.as1} ${row.as2} ${row.umdNm || ''}`.trim(),
            aptName: row.aptNm || '',
            area: Number(row.excluUseAr) || 0,
            deposit: Number(row.deposit) || 0,
            rent: Number(row.monthlyRent) || 0,
            date: `${row.dealYear}-${String(row.dealMonth).padStart(2, '0')}-${String(row.dealDay).padStart(2, '0')}`,
            rentType: row.contractType || '',
            buildYear: Number(row.buildYear) || 0,
            floor: Number(row.floor) || 0
        }));

        return NextResponse.json(rentDeals);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
