import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface RegionRow {
    as1: string;
}

export async function GET() {
    try {
        // apt_list 테이블에서 시도 목록 조회
        const query = `
      SELECT DISTINCT as1 
      FROM apt_list 
      WHERE as1 IS NOT NULL AND as1 != ''
      ORDER BY 
        CASE 
          WHEN as1 = '서울특별시' THEN 1
          WHEN as1 = '경기도' THEN 2
          WHEN as1 = '인천광역시' THEN 3
          WHEN as1 = '부산광역시' THEN 4
          WHEN as1 = '대구광역시' THEN 5
          WHEN as1 = '대전광역시' THEN 6
          WHEN as1 = '광주광역시' THEN 7
          WHEN as1 = '울산광역시' THEN 8
          WHEN as1 = '세종특별자치시' THEN 9
          ELSE 10
        END,
        as1 ASC
    `;

        const rows = await executeQuery(query) as RegionRow[];

        // 프론트엔드 형식에 맞게 변환
        const provinces = rows.map(row => ({
            code: row.as1,
            name: row.as1
        }));

        return NextResponse.json(provinces);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
