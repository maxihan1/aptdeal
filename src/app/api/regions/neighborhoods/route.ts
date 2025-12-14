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

        // 세종특별자치시는 as2가 없으므로 특별 처리
        let query: string;
        let params: string[];

        if (province === '세종특별자치시' || city === '세종시') {
            query = `
                SELECT DISTINCT as3 
                FROM apt_list 
                WHERE as1 = '세종특별자치시'
                  AND as3 IS NOT NULL AND as3 != ''
                ORDER BY as3
            `;
            params = [];
        } else {
            query = `
                SELECT DISTINCT as3 
                FROM apt_list 
                WHERE as1 = ? 
                  AND as2 = ?
                  AND as3 IS NOT NULL AND as3 != ''
                ORDER BY as3
            `;
            params = [province, city];
        }

        const rows = await executeQuery(query, params) as RegionRow[];

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
