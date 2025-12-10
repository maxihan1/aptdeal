import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface RegionRow {
    as3: string;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const province = searchParams.get('province');
        const city = searchParams.get('city');

        if (!province || !city) {
            return NextResponse.json(
                { error: '시도(province)와 시군구(city) 파라미터가 필요합니다.' },
                { status: 400 }
            );
        }

        // apt_list 테이블에서 읍면동 목록 조회
        const query = `
      SELECT DISTINCT as3 
      FROM apt_list 
      WHERE as1 = ? 
        AND as2 = ?
        AND as3 IS NOT NULL AND as3 != ''
      ORDER BY as3
    `;

        const rows = await executeQuery(query, [province, city]) as RegionRow[];

        // 프론트엔드 형식에 맞게 변환
        const neighborhoods = rows.map(row => ({
            code: row.as3,
            name: row.as3
        }));

        return NextResponse.json(neighborhoods);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
