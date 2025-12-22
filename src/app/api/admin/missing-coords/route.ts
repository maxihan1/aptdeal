import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET() {
    try {
        // 좌표 없는 아파트 수
        const [countRows] = await pool.query<RowDataPacket[]>(`
            SELECT COUNT(*) as cnt FROM apt_basic_info 
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND kaptAddr IS NOT NULL AND kaptAddr != ''
        `);

        // 좌표 없는 아파트 목록 (상위 100개)
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT b.kaptCode, b.kaptName, b.kaptAddr
            FROM apt_basic_info b
            WHERE (b.latitude IS NULL OR b.longitude IS NULL)
            AND b.kaptAddr IS NOT NULL AND b.kaptAddr != ''
            LIMIT 100
        `);

        return NextResponse.json({
            totalCount: countRows[0].cnt,
            apartments: rows
        });
    } catch (error) {
        console.error('Error fetching missing coords:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
