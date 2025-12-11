import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sido = searchParams.get('sido');

        // Default to last 30 days if no date provided
        const dateCondition = startDate && endDate
            ? `d.dealDate >= '${startDate}' AND d.dealDate <= '${endDate} 23:59:59'`
            : `d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;

        let whereClause = dateCondition;
        const queryParams: any[] = [];

        if (sido && sido !== 'ALL') {
            // sido comes as a name (e.g. "서울특별시"), so we filter by as1 from apt_list
            whereClause += ` AND l.as1 = ?`;
            queryParams.push(sido);
        }

        const limitClause = (sido && sido !== 'ALL') ? '' : 'LIMIT 100';

        const query = `
      SELECT 
        l.as1, 
        l.as2,
        COUNT(*) as count
      FROM apt_deal_info d
      JOIN (
          SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 
          FROM apt_list
      ) l ON d.sggCd = l.sggCode
      WHERE ${whereClause}
      GROUP BY l.as1, l.as2
      ORDER BY count DESC
      ${limitClause}
    `;

        const rows = await executeQuery(query, queryParams);

        // Format region names
        const formattedRows = (rows as any[]).map((row, index) => {
            let regionName = `${row.as1} ${row.as2}`;
            // Apply city formatting regex logic if needed (e.g. 용인기흥구 -> 용인시 기흥구)
            if (row.as1.endsWith('도') && row.as2 && !row.as2.includes('시')) {
                const formattedAs2 = row.as2.replace(/^([가-힣]{2})([가-힣]{2,}구)$/, '$1시 $2');
                regionName = `${row.as1} ${formattedAs2}`;
            }
            return {
                rank: index + 1,
                region: regionName,
                count: row.count
            };
        });

        return NextResponse.json(formattedRows);

    } catch (error) {
        console.error("Rank Regions API Error:", error);
        return NextResponse.json({ error: "Failed to fetch rankings" }, { status: 500 });
    }
}
