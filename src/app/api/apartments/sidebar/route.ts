/**
 * 이름+동으로 아파트 사이드바 정보 조회 API
 * GET /api/apartments/sidebar?name=아파트명&dong=동이름
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const dong = searchParams.get('dong');

    if (!name) {
        return NextResponse.json({ error: 'name parameter is required' }, { status: 400 });
    }

    try {
        // 이름 정규화
        const normalizedName = name.replace(/\s+/g, '');

        // apt_basic_info에서 kaptCode 찾기
        let query = `
            SELECT kaptCode 
            FROM apt_basic_info 
            WHERE REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%')
        `;
        const params: string[] = [normalizedName];

        if (dong) {
            query += ` AND kaptAddr LIKE CONCAT('%', ?, '%')`;
            params.push(dong);
        }

        query += ` LIMIT 1`;

        const [rows] = await pool.query<RowDataPacket[]>(query, params);

        if (rows.length === 0) {
            // apt_basic_info에서 못 찾으면 기본 정보만 반환
            return NextResponse.json({
                basic: {
                    id: name,
                    name: name,
                    address: dong ? `${dong}` : '',
                    dongCount: null,
                    parkingRatio: null,
                    buildYear: null,
                    householdCount: null,
                    floors: null,
                },
                priceByArea: [],
                rentPriceByArea: [],
                recentDeals: [],
                recentRents: [],
                schools: null,
                nearby: null,
            });
        }

        // kaptCode를 찾았으면 해당 경로로 리다이렉트 (self-fetch 대신 redirect 사용)
        const kaptCode = rows[0].kaptCode;

        // 리다이렉트를 통해 /api/apartments/[id]/sidebar로 전달
        const redirectUrl = new URL(`/api/apartments/${kaptCode}/sidebar`, request.url);
        return NextResponse.redirect(redirectUrl, 307);

    } catch (error) {
        console.error('Sidebar API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
