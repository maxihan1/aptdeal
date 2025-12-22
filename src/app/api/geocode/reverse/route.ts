import { NextRequest, NextResponse } from 'next/server';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
        return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    if (!KAKAO_REST_API_KEY) {
        return NextResponse.json({ error: 'Kakao API key not configured' }, { status: 500 });
    }

    try {
        // Kakao 역지오코딩 API - coord2regioncode
        const response = await fetch(
            `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
            { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
        );

        if (!response.ok) {
            return NextResponse.json({ error: 'Kakao API error' }, { status: 500 });
        }

        const data = await response.json();

        if (data.documents && data.documents.length > 0) {
            // H (행정동) 타입 우선, 없으면 B (법정동)
            const region = data.documents.find((d: any) => d.region_type === 'H')
                || data.documents.find((d: any) => d.region_type === 'B')
                || data.documents[0];

            // 시도 + 시군구 + 읍면동 형태로 반환
            const address = [
                region.region_1depth_name, // 시도
                region.region_2depth_name, // 시군구
                region.region_3depth_name, // 읍면동
            ].filter(Boolean).join(' ');

            return NextResponse.json({
                address,
                sido: region.region_1depth_name,
                sigungu: region.region_2depth_name,
                dong: region.region_3depth_name,
            });
        }

        return NextResponse.json({ address: null });
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return NextResponse.json({ error: 'Failed to reverse geocode' }, { status: 500 });
    }
}
