import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ kaptCode: string }> }
) {
    const { kaptCode } = await params;

    try {
        const [rows] = await pool.query<RowDataPacket[]>(`
            SELECT * FROM apt_price_cache WHERE kapt_code = ?
        `, [kaptCode]);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Not found in apt_price_cache', kaptCode });
        }

        return NextResponse.json(rows[0]);
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
