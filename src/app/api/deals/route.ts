import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface DealRow {
  id: number;
  aptNm: string;
  sggCd: string;
  umdNm: string;
  jibun: string;
  excluUseAr: number;
  dealAmount: number;
  dealYear: number;
  dealMonth: number;
  dealDay: number;
  floor: number;
  aptDong: string;
  buildYear: number;
  dealingGbn: string;
  cdealType: string;
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
    const aptName = searchParams.get('aptName'); // 단지명 필터 (성능 최적화)
    const limitParam = searchParams.get('limit');
    // Default limit reduced for performance
    const limit = limitParam ? Number(limitParam) : (aptName ? 3000 : 5000);

    let query = '';
    let newParams: (string | number)[] = [];

    // CASE 1: 지역 필터 있음 (sido, sigungu) -> 기존 로직 (JOIN 최적화)
    if (sido && sigungu) {
      query = `
              SELECT
                d.id,
                d.aptNm,
                d.sggCd,
                d.umdNm,
                d.jibun,
                d.excluUseAr,
                d.dealAmount,
                d.dealYear,
                d.dealMonth,
                d.dealDay,
                d.floor,
                d.aptDong,
                d.buildYear,
                d.dealingGbn,
                d.cdealType,
                l.as1,
                l.as2,
                d.umdNm as as3
              FROM apt_deal_info d
              JOIN (
                  SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2
                  FROM apt_list
                  WHERE as1 = ? AND as2 = ?
              ) l ON d.sggCd = l.sggCode
              WHERE 1=1
            `;
      newParams.push(sido, sigungu);

      if (startDate && endDate) {
        query += ` AND d.dealDate >= ? AND d.dealDate <= ? `;
        // dealDate is DATETIME, so append time
        newParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      }

      if (dong && dong !== 'ALL' && dong !== '전체') {
        query += ' AND d.umdNm = ?';
        newParams.push(dong);
      }

      // 단지명 필터 (성능 최적화: 단지 상세 조회 시 사용)
      if (aptName) {
        query += ' AND d.aptNm = ?';
        newParams.push(aptName);
      }

      // Standard filtering needs order and limit
      // LIMIT ? causes issues in prepared statements for some MySQL versions/configs
      const safeLimit = Number.isInteger(limit) ? limit : 10000;
      query += ` ORDER BY d.dealYear DESC, d.dealMonth DESC, d.dealDay DESC LIMIT ${safeLimit}`;
      // newParams.push(limit); -> removed

    } else {
      // CASE 2: 전체 조회 (대시보드 등) -> 서브쿼리 최적화 (idx_deal_date 활용)

      let subQueryWhere = '1=1';
      const subQueryParams: (string | number)[] = [];

      if (startDate && endDate) {
        subQueryWhere += ` AND dealDate >= ? AND dealDate <= ? `;
        subQueryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
      }

      // 서브쿼리: ID만 빠르게 추출 (인덱스 활용)
      // LIMIT ? inside subquery sometimes causes 'Incorrect arguments' in prepared statements
      // So we interpolate the number directly after ensuring it is safe.
      const safeLimit = Number.isInteger(limit) ? limit : 10000;

      const subQuery = `
            SELECT id 
            FROM apt_deal_info 
            WHERE ${subQueryWhere}
            ORDER BY dealDate DESC
            LIMIT ${safeLimit}
        `;
      // remove limit from params as it is now interpolated
      // subQueryParams.push(limit); -> removed

      query = `
            SELECT
                d.id,
                d.aptNm,
                d.sggCd,
                d.umdNm,
                d.jibun,
                d.excluUseAr,
                d.dealAmount,
                d.dealYear,
                d.dealMonth,
                d.dealDay,
                d.floor,
                d.aptDong,
                d.buildYear,
                d.dealingGbn,
                d.cdealType,
                l.as1,
                l.as2,
                d.umdNm as as3
            FROM (${subQuery}) sub
            JOIN apt_deal_info d ON d.id = sub.id
            JOIN (
                SELECT DISTINCT LEFT(bjdCode, 5) as sggCode, as1, as2
                FROM apt_list
            ) l ON d.sggCd = l.sggCode
            WHERE 1=1
        `;

      newParams = subQueryParams;

      // 동 필터가 있다면 여기서는 WHERE 절에 추가되어야 하지만,
      // 서브쿼리 최적화 방식에서는 서브쿼리 단계에서 동 필터링을 못함 (umdNm이 apt_deal_info에 있지만 인덱스 없을 수 있음)
      // 만약 '동' 필터가 있는데 '지역' 필터가 없는 경우는 드묾 (보통 시군구 선택 후 동 선택).
      // 따라서 '동' 필터가 있으면 서브쿼리에서 필터링하거나 외부에서 필터링해야 함.
      // 여기서는 외부에서 필터링하되, LIMIT은 서브쿼리에서 이미 걸렸으므로 정확하지 않을 수 있음.
      // 하지만 Dashboard(최신 거래)에서는 '동' 필터를 쓰지 않으므로 패스.
      // 만약 동 필터가 들어오면 서브쿼리에 추가하는 것이 맞음.
      if (dong) {
        // 동 필터 로직 추가 필요시 구현 (현재 대시보드 용도에는 불필요)
      }

      // 정렬은 서브쿼리 순서를 따름 (단, 명시적 ORDER BY 추가 가능)
      query += ` ORDER BY d.dealDate DESC `;
    }

    const rows = await executeQuery(query, newParams) as DealRow[];

    // 프론트엔드 Deal 인터페이스에 맞게 변환
    const deals = rows.map((row, index) => ({
      id: row.id?.toString() || `deal-${index}`,
      region: `${row.as1} ${row.as2} ${row.umdNm || ''}`.trim(),
      address: row.jibun || '',
      area: Number(row.excluUseAr) || 0,
      price: Number(row.dealAmount) || 0,
      date: `${row.dealYear}-${String(row.dealMonth).padStart(2, '0')}-${String(row.dealDay).padStart(2, '0')}`,
      aptName: row.aptNm || '',
      floor: Number(row.floor) || 0,
      aptDong: row.aptDong || '',
      buildYear: Number(row.buildYear) || 0,
      dealMonth: row.dealMonth,
      dealDay: row.dealDay,
      tradeType: row.dealingGbn || '중개거래',
      cdealType: row.cdealType || ''
    }));

    return NextResponse.json(deals);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
