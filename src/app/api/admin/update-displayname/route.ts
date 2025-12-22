import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export async function POST(request: Request) {
    if (!KAKAO_REST_API_KEY) {
        return NextResponse.json({ error: 'KAKAO_REST_API_KEY not configured' }, { status: 500 });
    }

    try {
        const { kaptCode } = await request.json();

        if (!kaptCode) {
            return NextResponse.json({ error: 'kaptCode is required' }, { status: 400 });
        }

        // 아파트 정보 조회
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT kaptCode, kaptName, kaptAddr 
            FROM apt_basic_info 
            WHERE kaptCode = ?
        `, [kaptCode]);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Apartment not found' }, { status: 404 });
        }

        const apt = rows[0];

        // Kakao 키워드 검색으로 displayName 조회
        const searchQuery = `${apt.kaptAddr} 아파트`;
        const response = await fetch(
            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchQuery)}&size=3`,
            { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
        );

        if (!response.ok) {
            return NextResponse.json({ error: 'Kakao API error' }, { status: 500 });
        }

        const data = await response.json();

        if (!data.documents || data.documents.length === 0) {
            return NextResponse.json({
                error: 'No Kakao results',
                searchQuery,
                kaptCode,
                kaptName: apt.kaptName
            });
        }

        // 아파트 카테고리 우선
        const aptDoc = data.documents.find((d: any) => d.category_name?.includes('아파트')) || data.documents[0];
        const kakaoName = aptDoc.place_name;
        const displayName = kakaoName.replace(/아파트$/g, '').trim();

        // apt_search_index 업데이트
        await pool.query(`
            UPDATE apt_search_index 
            SET displayName = ?
            WHERE kapt_code = ?
        `, [displayName, kaptCode]);

        return NextResponse.json({
            success: true,
            kaptCode,
            kaptName: apt.kaptName,
            kakaoName,
            displayName,
            message: `Updated displayName to: ${displayName}`
        });

    } catch (error) {
        console.error('Error updating displayName:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}
