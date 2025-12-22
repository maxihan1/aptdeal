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
        let aptName = searchParams.get('aptName'); // 단지명 필터 (성능 최적화)
        const kaptCode = searchParams.get('kaptCode'); // kaptCode로 정확한 단지명 조회

        // kaptCode가 있으면 apt_name_mapping에서 deal_apt_name 조회
        if (kaptCode) {
            try {
                const mappingResult = await executeQuery(`
                    SELECT deal_apt_name 
                    FROM apt_name_mapping 
                    WHERE kapt_code = ? 
                    LIMIT 1
                `, [kaptCode]) as { deal_apt_name: string }[];

                if (mappingResult.length > 0 && mappingResult[0].deal_apt_name) {
                    aptName = mappingResult[0].deal_apt_name;
                    console.log(`[Rent API] Mapping found: kaptCode=${kaptCode} -> aptName=${aptName}`);
                } else {
                    console.warn(`[Rent API] No mapping for kaptCode: ${kaptCode}, falling back to aptName: ${aptName || '(none)'}`);
                }
            } catch (mappingError) {
                console.error(`[Rent API] Mapping query error:`, mappingError);
            }
        }

        if (!sido || !sigungu || !startDate || !endDate) {
            return NextResponse.json(
                { error: '필수 파라미터가 누락되었습니다. (sido, sigungu, startDate, endDate)' },
                { status: 400 }
            );
        }

        // 1단계: sido + sigungu로 sggCd 조회 (간단한 인덱스 쿼리)
        const sggResult = await executeQuery(`
            SELECT LEFT(bjdCode, 5) as sggCode
            FROM apt_list
            WHERE as1 = ? AND as2 = ?
            LIMIT 1
        `, [sido, sigungu]) as { sggCode: string }[];

        if (sggResult.length === 0) {
            return NextResponse.json([]);
        }

        const sggCode = sggResult[0].sggCode;

        // 2단계: sggCd로 직접 조회 (JOIN 없이 인덱스 활용)
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
        ? as as1,
        ? as as2,
        r.umdNm as as3
      FROM apt_rent_info r
      WHERE r.sggCd = ? AND r.dealDate >= ? AND r.dealDate <= ?
    `;

        const params: (string | number)[] = [
            sido, sigungu, sggCode,
            startDate, endDate
        ];

        // 동 필터 (선택)
        if (dong && dong !== 'ALL' && dong !== '전체') {
            query += ' AND r.umdNm = ?';
            params.push(dong);
        }

        // 단지명 필터 (성능 최적화: 단지 상세 조회 시 사용)
        if (aptName) {
            query += ' AND r.aptNm = ?';
            params.push(aptName);
        }

        // limit 조정: aptName이 있으면 더 적은 데이터
        const limit = aptName ? 3000 : 5000;
        query += ` ORDER BY r.dealDate DESC LIMIT ${limit}`;

        const rows = await executeQuery(query, params) as RentRow[];

        // displayName 조회 - aptName 필터가 있으면 이미 특정 단지만 조회했으므로 스킵
        let displayNameMap: Map<string, string> = new Map();
        if (rows.length > 0 && rows.length < 500 && !aptName) {
            // rows에서 유니크한 (aptNm, umdNm) 조합 추출
            const uniqueApts = [...new Set(rows.map(r => `${r.aptNm}|${r.umdNm}`))];

            // 성능 최적화: 유니크 아파트가 너무 많으면 스킵
            if (uniqueApts.length <= 50) {
                // 튜플 IN 절 사용 (인덱스 활용 가능)
                const tupleParams: string[] = [];
                uniqueApts.forEach(apt => {
                    const [aptNm, umdNm] = apt.split('|');
                    tupleParams.push(aptNm, umdNm);
                });

                const placeholders = uniqueApts.map(() => '(?, ?)').join(',');
                const displayQuery = `
                    SELECT aptNm, umdNm, COALESCE(displayName, aptNm) as displayName
                    FROM apt_search_index
                    WHERE (aptNm, umdNm) IN (${placeholders})
                `;
                try {
                    const displayRows = await executeQuery(displayQuery, tupleParams) as { aptNm: string, umdNm: string, displayName: string }[];
                    displayRows.forEach(row => {
                        displayNameMap.set(`${row.aptNm}|${row.umdNm}`, row.displayName || row.aptNm);
                    });
                } catch (err) {
                    console.warn('Failed to fetch displayNames for rent', err);
                }
            }
        }

        // 프론트엔드 RentDeal 인터페이스에 맞게 변환
        const rentDeals = rows.map((row, index) => {
            const key = `${row.aptNm}|${row.umdNm}`;
            return {
                id: row.id?.toString() || `rent-${index}`,
                region: `${row.as1} ${row.as2} ${row.umdNm || ''}`.trim(),
                aptName: displayNameMap.get(key) || row.aptNm || '', // displayName 우선 사용
                aptNm: row.aptNm || '', // 원본명 유지 (URL용)
                area: Number(row.excluUseAr) || 0,
                deposit: Number(row.deposit) || 0,
                rent: Number(row.monthlyRent) || 0,
                date: `${row.dealYear}-${String(row.dealMonth).padStart(2, '0')}-${String(row.dealDay).padStart(2, '0')}`,
                rentType: row.contractType || '',
                buildYear: Number(row.buildYear) || 0,
                floor: Number(row.floor) || 0
            };
        });

        return NextResponse.json(rentDeals);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
