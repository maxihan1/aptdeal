import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface RegionRow {
    as2: string;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const province = searchParams.get('province');

        if (!province) {
            return NextResponse.json(
                { error: '시도(province) 파라미터가 필요합니다.' },
                { status: 400 }
            );
        }

        // apt_list 테이블에서 시군구 목록 조회
        const query = `
      SELECT DISTINCT as2 
      FROM apt_list 
      WHERE as1 = ? 
        AND as2 IS NOT NULL AND as2 != ''
      ORDER BY as2
    `;

        const rows = await executeQuery(query, [province]) as RegionRow[];

        // 프론트엔드 형식에 맞게 변환
        const cities = rows.map(row => {
            let name = row.as2;
            // '용인기흥구' -> '용인시 기흥구' 변환 (도가 포함된 지역의 경우)
            if (province && province.endsWith('도') && !name.includes(' ') && !name.includes('시')) {
                // 2글자 도시명 + 2글자 이상 구 이름 (예: 포항남구, 용인기흥구)
                name = name.replace(/^([가-힣]{2})([가-힣]{2,}구)$/, '$1시 $2');
            }
            return {
                code: row.as2,
                name: name
            };
        });

        return NextResponse.json(cities);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
