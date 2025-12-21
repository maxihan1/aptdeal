import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const kaptCode = searchParams.get('kaptCode');
        const aptName = searchParams.get('aptName');
        const dong = searchParams.get('dong');

        let rows: RowDataPacket[] = [];

        // 1. kaptCode로 조회
        if (kaptCode) {
            const baseKaptCode = kaptCode.includes('_') ? kaptCode.split('_')[0] : kaptCode;
            [rows] = await pool.query<RowDataPacket[]>(
                `SELECT latitude as lat, longitude as lng FROM apt_basic_info WHERE kaptCode = ? LIMIT 1`,
                [baseKaptCode]
            );
        }

        // 2. kaptCode로 못 찾으면 아파트명+동으로 조회
        if (rows.length === 0 && aptName) {
            // 아파트명 정규화 (공백 제거)
            const normalizedName = aptName.replace(/\s+/g, '');

            [rows] = await pool.query<RowDataPacket[]>(
                `SELECT latitude as lat, longitude as lng 
                 FROM apt_basic_info 
                 WHERE REPLACE(kaptName, ' ', '') LIKE CONCAT('%', ?, '%')
                 ${dong ? "AND kaptAddr LIKE CONCAT('%', ?, '%')" : ""}
                 LIMIT 1`,
                dong ? [normalizedName, dong] : [normalizedName]
            );
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Not found', lat: null, lng: null }, { status: 404 });
        }

        return NextResponse.json({
            lat: parseFloat(rows[0].lat) || null,
            lng: parseFloat(rows[0].lng) || null,
        });

    } catch (error) {
        console.error('Coordinates API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
