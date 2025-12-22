import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST() {
    if (!KAKAO_REST_API_KEY) {
        return NextResponse.json({ error: 'KAKAO_REST_API_KEY not configured' }, { status: 500 });
    }

    try {
        // 좌표 없는 아파트 조회 (주소가 있는 것만)
        const [apts] = await pool.query<RowDataPacket[]>(`
            SELECT kaptCode, kaptName, kaptAddr
            FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL AND kaptAddr != ''
            LIMIT 500
        `);

        console.log(`[Fill Coords] Found ${apts.length} apartments without coordinates`);

        let updated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const apt of apts) {
            try {
                // Kakao 주소 검색 API
                const response = await fetch(
                    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(apt.kaptAddr)}`,
                    { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.documents && data.documents.length > 0) {
                        const doc = data.documents[0];
                        const lat = parseFloat(doc.y);
                        const lng = parseFloat(doc.x);

                        await pool.query(
                            `UPDATE apt_basic_info SET latitude = ?, longitude = ? WHERE kaptCode = ?`,
                            [lat, lng, apt.kaptCode]
                        );
                        updated++;
                        console.log(`[Fill Coords] Updated ${apt.kaptCode}: ${apt.kaptName} -> (${lat}, ${lng})`);
                    } else {
                        // 주소 검색 실패 시 키워드 검색 시도
                        const kwResponse = await fetch(
                            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(apt.kaptName + ' 아파트')}`,
                            { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
                        );

                        if (kwResponse.ok) {
                            const kwData = await kwResponse.json();
                            if (kwData.documents && kwData.documents.length > 0) {
                                const doc = kwData.documents[0];
                                const lat = parseFloat(doc.y);
                                const lng = parseFloat(doc.x);

                                await pool.query(
                                    `UPDATE apt_basic_info SET latitude = ?, longitude = ? WHERE kaptCode = ?`,
                                    [lat, lng, apt.kaptCode]
                                );
                                updated++;
                                console.log(`[Fill Coords] Updated (keyword) ${apt.kaptCode}: ${apt.kaptName} -> (${lat}, ${lng})`);
                            } else {
                                failed++;
                                errors.push(`${apt.kaptCode}: ${apt.kaptName} - No results`);
                            }
                        }
                    }
                } else {
                    failed++;
                    errors.push(`${apt.kaptCode}: ${apt.kaptName} - API error ${response.status}`);
                }

                // Rate limiting
                await sleep(100);
            } catch (e) {
                failed++;
                errors.push(`${apt.kaptCode}: ${apt.kaptName} - ${e}`);
            }
        }

        // 남은 개수 확인
        const [remaining] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as cnt FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL AND kaptAddr != ''
        `);

        return NextResponse.json({
            processed: apts.length,
            updated,
            failed,
            remaining: remaining[0].cnt,
            errors: errors.slice(0, 20)
        });
    } catch (error) {
        console.error('Error filling coords:', error);
        return NextResponse.json({ error: 'Failed to fill coordinates' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to fill missing coordinates',
        note: 'This will process up to 500 apartments per request'
    });
}
