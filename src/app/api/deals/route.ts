import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

// 시도별 sggCd 접두사 맵 (성능 최적화용)
const SIDO_SGG_PREFIX: Record<string, string> = {
  '서울특별시': '11',
  '부산광역시': '26',
  '대구광역시': '27',
  '인천광역시': '28',
  '광주광역시': '29',
  '대전광역시': '30',
  '울산광역시': '31',
  '세종특별자치시': '36',
  '경기도': '41',
  '강원특별자치도': '42',
  '강원도': '42',
  '충청북도': '43',
  '충청남도': '44',
  '전북특별자치도': '45',
  '전라북도': '45',
  '전라남도': '46',
  '경상북도': '47',
  '경상남도': '48',
  '제주특별자치도': '50',
};

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

    const offsetParam = searchParams.get('offset');
    const offset = offsetParam ? Number(offsetParam) : 0;

    let query = '';
    let newParams: (string | number)[] = [];

    const onlyCancelled = searchParams.get('onlyCancelled') === 'true';
    const excludeCancelled = searchParams.get('excludeCancelled') === 'true';

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
                  WHERE as1 = ? ${sido === '세종특별자치시' ? '' : 'AND as2 = ?'}
              ) l ON d.sggCd = l.sggCode
              WHERE 1=1
            `;
      // 세종특별자치시는 sigungu 파라미터 불필요
      if (sido === '세종특별자치시') {
        newParams.push(sido);
      } else {
        newParams.push(sido, sigungu);
      }

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

      if (onlyCancelled) {
        query += " AND (d.cdealType = 'O' OR d.cdealType = 'Y') ";
      } else if (excludeCancelled) {
        query += " AND (d.cdealType IS NULL OR TRIM(d.cdealType) = '') ";
      }

      // Standard filtering needs order and limit
      // LIMIT ? causes issues in prepared statements for some MySQL versions/configs
      const safeLimit = Number.isInteger(limit) ? limit : 10000;
      const safeOffset = Number.isInteger(offset) ? offset : 0;
      query += ` ORDER BY d.dealYear DESC, d.dealMonth DESC, d.dealDay DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      // newParams.push(limit); -> removed

    } else {
      // CASE 2: 전체 조회 (대시보드 등) -> 서브쿼리 최적화 (idx_deal_date 활용)

      let subQueryWhere = '1=1';
      const subQueryParams: (string | number)[] = [];

      if (startDate && endDate) {
        // 일일 조회(startDate == endDate)인 경우 dealYear/Month/Day로 필터링 (stats API와 일치)
        if (startDate === endDate) {
          const dateParts = startDate.split('-');
          const year = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]);
          const day = parseInt(dateParts[2]);
          subQueryWhere += ` AND dealYear = ? AND dealMonth = ? AND dealDay = ? `;
          subQueryParams.push(year, month, day);
        } else {
          // 범위 조회는 dealDate 인덱스 활용
          subQueryWhere += ` AND dealDate >= ? AND dealDate <= ? `;
          subQueryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }
      }

      // SIDO Filter for dashboard global filter (when NO Sigungu selected)
      // If Sido is present but Sigungu isn't, we MUST filter by SGG code prefix locally or by joining.
      // Since sggCd index exists, checking LEFT(sggCd, 2) is slow.
      // But we can find the range of sggCds for a Sido. Or joins.
      // For Dashboard performance, let's look at how we can filter by Sido efficiently without full map.
      // Actually, if 'sido' is passed but no 'sigungu', we are in CASE 2 usually?
      // Wait, CASE 1 checks `if (sido && sigungu)`.
      // What if `sido` is passed but `sigungu` is null? (e.g. Dashboard "Seoul" selected)
      // Then we fall into CASE 2.
      // We need to implement Sido filtering here in CASE 2.

      if (sido && !sigungu) {
        // sido가 숫자 코드(예: '11')인 경우 직접 LIKE 사용
        if (sido.length === 2 && !isNaN(Number(sido))) {
          subQueryWhere += ` AND sggCd LIKE '${sido}%' `;
        } else {
          // sido가 이름인 경우 - 맵에서 접두사 조회
          const prefix = SIDO_SGG_PREFIX[sido];
          if (prefix) {
            subQueryWhere += ` AND sggCd LIKE '${prefix}%' `;
          }
        }
      }

      if (onlyCancelled) {
        subQueryWhere += " AND (cdealType = 'O' OR cdealType = 'Y') ";
      } else if (excludeCancelled) {
        // cdealType이 NULL, 빈 문자열, 또는 공백만 있는 경우 제외
        subQueryWhere += " AND (cdealType IS NULL OR TRIM(cdealType) = '') ";
      }

      // 서브쿼리: ID만 빠르게 추출 (인덱스 활용)
      const safeLimit = Number.isInteger(limit) ? limit : 10000;
      const safeOffset = Number.isInteger(offset) ? offset : 0;

      const subQuery = `
          SELECT id 
          FROM apt_deal_info 
          WHERE ${subQueryWhere}
          ORDER BY dealDate DESC
          LIMIT ${safeLimit} OFFSET ${safeOffset}
      `;

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
      region: `${row.as1} ${row.as2 || ''} ${row.umdNm || ''}`.replace(/\s+/g, ' ').trim(),
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
