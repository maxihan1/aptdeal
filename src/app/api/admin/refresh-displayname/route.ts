import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
    if (!KAKAO_REST_API_KEY) {
        return NextResponse.json({ error: 'KAKAO_REST_API_KEY not configured' }, { status: 500 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const batchSize = body.batchSize || 200;

        // displayName = aptNm인 아파트 조회 (배치)
        const [apts] = await pool.query<RowDataPacket[]>(`
            SELECT si.id, si.kapt_code, si.aptNm, si.umdNm, ab.kaptAddr, ab.kaptName
            FROM apt_search_index si
            JOIN apt_basic_info ab ON si.kapt_code COLLATE utf8mb4_unicode_ci = ab.kaptCode COLLATE utf8mb4_unicode_ci
            WHERE si.displayName = si.aptNm
            LIMIT ?
        `, [batchSize]);

        console.log(`[Refresh DisplayName] Processing ${apts.length} apartments`);

        let updated = 0;
        let failed = 0;
        let noChange = 0;
        const changes: { kaptCode: string; before: string; after: string }[] = [];
        const errors: string[] = [];

        for (const apt of apts) {
            try {
                // Kakao 키워드 검색
                const searchQuery = apt.kaptAddr || `${apt.umdNm} ${apt.aptNm} 아파트`;
                const response = await fetch(
                    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(searchQuery + ' 아파트')}&size=3`,
                    { headers: { 'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}` } }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.documents && data.documents.length > 0) {
                        // 아파트 카테고리 우선
                        const aptDoc = data.documents.find((d: any) => d.category_name?.includes('아파트')) || data.documents[0];
                        const kakaoName = aptDoc.place_name;
                        const newDisplayName = kakaoName.replace(/아파트$/g, '').trim();

                        // 기존과 다른 경우에만 업데이트
                        if (newDisplayName !== apt.aptNm) {
                            await pool.query(`
                                UPDATE apt_search_index 
                                SET displayName = ?
                                WHERE id = ?
                            `, [newDisplayName, apt.id]);

                            updated++;
                            if (changes.length < 50) {
                                changes.push({
                                    kaptCode: apt.kapt_code,
                                    before: apt.aptNm,
                                    after: newDisplayName
                                });
                            }
                        } else {
                            noChange++;
                        }
                    } else {
                        failed++;
                        if (errors.length < 20) {
                            errors.push(`${apt.kapt_code}: No Kakao results`);
                        }
                    }
                } else {
                    failed++;
                    if (errors.length < 20) {
                        errors.push(`${apt.kapt_code}: API error ${response.status}`);
                    }
                }

                // Rate limiting
                await sleep(80);
            } catch (e) {
                failed++;
                if (errors.length < 20) {
                    errors.push(`${apt.kapt_code}: ${e}`);
                }
            }
        }

        // 남은 개수 확인
        const [remaining] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as cnt FROM apt_search_index WHERE displayName = aptNm
        `);

        return NextResponse.json({
            processed: apts.length,
            updated,
            noChange,
            failed,
            remaining: remaining[0].cnt,
            changesSample: changes,
            errors
        });
    } catch (error) {
        console.error('Error refreshing displayName:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown';
        return NextResponse.json({ error: 'Failed', details: errMsg }, { status: 500 });
    }
}

export async function GET() {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as cnt FROM apt_search_index WHERE displayName = aptNm
        `);
        return NextResponse.json({
            remaining: rows[0].cnt,
            message: 'POST to this endpoint to refresh displayName for apartments where displayName = aptNm'
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
