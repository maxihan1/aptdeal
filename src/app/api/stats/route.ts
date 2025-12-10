import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';
import { RowDataPacket } from 'mysql2';

// 쿼리 결과 타입 정의
interface StatsResult extends RowDataPacket {
  count: number;
}

interface TrendResult extends RowDataPacket {
  date: string;
  average: number;
  count: number;
}

interface RegionResult extends RowDataPacket {
  region: string;
  count: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sido = searchParams.get('sido');
    const sigungu = searchParams.get('sigungu');

    // Common join clause for region filtering
    const regionJoin = `
      JOIN (
          SELECT DISTINCT LEFT(bjdCode, 5) COLLATE utf8mb4_unicode_ci as sggCode, as1, as2 
          FROM apt_list
          WHERE 1=1
          ${sido ? 'AND as1 = ?' : ''}
          ${sigungu ? 'AND as2 = ?' : ''}
      ) l ON d.sggCd = l.sggCode
    `;

    const regionParams = [];
    if (sido) regionParams.push(sido);
    if (sigungu) regionParams.push(sigungu);

    // 1. Top Trading Region (Global, Last 30 days)
    // If global: show top Districts or Sidos? Assuming top "Sgg" (Regions)
    const topRegionQuery = `
      SELECT 
        CONCAT(l.as1, ' ', l.as2) as region,
        COUNT(*) as count
      FROM apt_deal_info d
      ${regionJoin}
      WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY l.as1, l.as2
      ORDER BY count DESC
      LIMIT 1
    `;

    // 2. Monthly Volume (Global, Last 30 days)
    const monthlyVolumeQuery = `
      SELECT COUNT(*) as count
      FROM apt_deal_info d
      ${sido || sigungu ? regionJoin : ''}
      WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `;

    // 3. Latest Daily Volume (Smart "Today")
    const latestVolumeQuery = `
      SELECT dealDate, COUNT(*) as count
      FROM apt_deal_info d
      ${sido || sigungu ? regionJoin : ''}
      WHERE dealDate = (SELECT MAX(dealDate) FROM apt_deal_info)
      GROUP BY dealDate
    `;

    // 4. Cancelled Deals (Global, Last 30 days)
    const cancelledQuery = `
      SELECT COUNT(*) as count
      FROM apt_deal_info d
       ${sido || sigungu ? regionJoin : ''}
      WHERE dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      AND cdealType IS NOT NULL AND cdealType != ''
    `;

    const pyeong = searchParams.get('pyeong');

    // 5. Recent Trend (Last 30 days) - Filterable (Already handles params logic via new approach)
    let trendQuery = `
      SELECT 
        DATE_FORMAT(d.dealDate, '%m-%d') as date,
        ROUND(AVG(d.dealAmount)) as average,
        COUNT(*) as count
      FROM apt_deal_info d
      ${sido || sigungu ? regionJoin : ''}
      WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `;

    // Add Pyeong Filter logic
    if (pyeong) {
      if (pyeong === '20') {
        trendQuery += ` AND d.excluUseAr <= 60.00 `;
      } else if (pyeong === '30') {
        trendQuery += ` AND d.excluUseAr > 60.00 AND d.excluUseAr <= 85.00 `;
      } else if (pyeong === '40') {
        trendQuery += ` AND d.excluUseAr > 85.00 AND d.excluUseAr <= 135.00 `;
      } else if (pyeong === '50') {
        trendQuery += ` AND d.excluUseAr > 135.00 `;
      }
    }

    trendQuery += `
      GROUP BY date
      ORDER BY date ASC
    `;

    // 6. Popular Complexes (Most Traded in Last 30 Days)
    const popularComplexesQuery = `
      SELECT 
        d.aptNm, 
        CONCAT(l.as1, ' ', l.as2, ' ', IFNULL(d.umdNm, '')) as region,
        l.as1 as sido,
        l.as2 as sigungu,
        d.umdNm as dong,
        COUNT(*) as count 
      FROM apt_deal_info d
      ${regionJoin}
      WHERE d.dealDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY d.aptNm, region, l.as1, l.as2, d.umdNm
      ORDER BY count DESC 
      LIMIT 5
    `;

    const topRegionRows = await executeQuery(topRegionQuery, regionParams) as RegionResult[];
    const monthlyVolumeRows = await executeQuery(monthlyVolumeQuery, (sido || sigungu) ? regionParams : []) as StatsResult[];
    const latestVolumeRows = await executeQuery(latestVolumeQuery, (sido || sigungu) ? regionParams : []) as (StatsResult & { dealDate: Date })[];
    const cancelledRows = await executeQuery(cancelledQuery, (sido || sigungu) ? regionParams : []) as StatsResult[];
    // Trend Query uses the same regionParams if filtering is active
    const trendRows = await executeQuery(trendQuery, (sido || sigungu) ? regionParams : []) as TrendResult[];
    // Popular Complexes always uses regionJoin to get region name strings, so it needs params
    const popularComplexRows = await executeQuery(popularComplexesQuery, regionParams) as (RegionResult & { aptNm: string })[];

    // Helper to format region name (e.g. '경기도 용인기흥구 ...' -> '경기도 용인시 기흥구 ...')
    const formatRegionString = (fullRegion: string) => {
      if (!fullRegion) return '';
      const parts = fullRegion.split(' ');
      const as1 = parts[0]; // Province
      const as2 = parts[1]; // City

      if (as1 && as1.endsWith('도') && as2 && !as2.includes('시')) {
        // Apply same regex as cities API
        const formattedAs2 = as2.replace(/^([가-힣]{2})([가-힣]{2,}구)$/, '$1시 $2');
        parts[1] = formattedAs2;
      }
      return parts.join(' ');
    };

    const topRegion = topRegionRows[0] || { region: "데이터 없음", count: 0 };
    if (topRegion.region !== "데이터 없음") {
      topRegion.region = formatRegionString(topRegion.region);
    }

    const popularComplexes = popularComplexRows.map(row => ({
      ...row,
      region: formatRegionString(row.region)
    }));

    return NextResponse.json({
      topRegion: topRegion,
      monthlyVolume: monthlyVolumeRows[0]?.count || 0,
      todayVolume: latestVolumeRows[0]?.count || 0, // Now represents latest available day
      latestDate: latestVolumeRows[0]?.dealDate || null, // Front-end can display "12.07 기준"
      cancelledCount: cancelledRows[0]?.count || 0,
      trend: trendRows,
      popularComplexes: popularComplexes
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
