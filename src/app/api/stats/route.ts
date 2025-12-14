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

    // 캐시 조회 (sigungu가 없는 경우만 캐시 사용)
    if (!sigungu) {
      const regionCode = sido || 'ALL';
      try {
        const cacheResult = await executeQuery(`
          SELECT stat_value, calculated_at 
          FROM dashboard_stats_cache 
          WHERE region_code = ? AND stat_type = 'dashboard'
          AND calculated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `, [regionCode]);

        // executeQuery는 [rows, fields]를 반환하거나 rows만 반환할 수 있음
        const cacheRows = Array.isArray(cacheResult) ? cacheResult : [];

        console.log(`[Cache] Region: ${regionCode}, Found: ${cacheRows.length} rows`);

        if (cacheRows && cacheRows.length > 0) {
          const firstRow = cacheRows[0] as { stat_value: string | object, calculated_at: Date };
          // MySQL JSON 타입은 이미 객체로 반환될 수 있음
          const cachedData = typeof firstRow.stat_value === 'string'
            ? JSON.parse(firstRow.stat_value)
            : firstRow.stat_value;
          console.log(`[Cache] HIT for ${regionCode}`);
          // 캐시된 데이터 그대로 반환 (trend, popularComplexes 포함)
          return NextResponse.json({
            ...cachedData,
            fromCache: true
          });
        }
        console.log(`[Cache] MISS for ${regionCode}`);
      } catch (cacheError) {
        // 캐시 테이블이 없거나 에러 시 무시하고 기존 로직 실행
        console.log('Cache error:', cacheError);
      }
    }

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

    // 1. Top Trading Region (Last 30 days) - 최고 거래량 지역
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

    // 3. Latest Daily Volume - dealYear/Month/Day 기준 (한국 날짜)
    // dealDate(UTC)와 dealYear/Month/Day가 1일 차이나므로 dealYear/Month/Day 사용
    const latestDateQuery = sido || sigungu
      ? `
        SELECT dealYear, dealMonth, dealDay
        FROM apt_deal_info d
        ${regionJoin}
        ORDER BY dealYear DESC, dealMonth DESC, dealDay DESC
        LIMIT 1
      `
      : `
        SELECT dealYear, dealMonth, dealDay
        FROM apt_deal_info
        ORDER BY dealYear DESC, dealMonth DESC, dealDay DESC
        LIMIT 1
      `;

    const latestVolumeQuery = sido || sigungu
      ? `
        SELECT COUNT(*) as count
        FROM apt_deal_info d
        ${regionJoin}
        WHERE d.dealYear = ? AND d.dealMonth = ? AND d.dealDay = ?
      `
      : `
        SELECT COUNT(*) as count
        FROM apt_deal_info d
        WHERE dealYear = ? AND dealMonth = ? AND dealDay = ?
      `;

    // 4. Cancelled Deals (Last 30 days)
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

    // 병렬 실행으로 성능 개선 - 먼저 최신 날짜를 가져온 후 일일거래량 조회
    const [topRegionRows, monthlyVolumeRows, latestDateResult, cancelledRows, trendRows, popularComplexRows] = await Promise.all([
      executeQuery(topRegionQuery, regionParams) as Promise<RegionResult[]>,
      executeQuery(monthlyVolumeQuery, (sido || sigungu) ? regionParams : []) as Promise<StatsResult[]>,
      executeQuery(latestDateQuery, (sido || sigungu) ? regionParams : []) as Promise<{ dealYear: number, dealMonth: number, dealDay: number }[]>,
      executeQuery(cancelledQuery, (sido || sigungu) ? regionParams : []) as Promise<StatsResult[]>,
      executeQuery(trendQuery, (sido || sigungu) ? regionParams : []) as Promise<TrendResult[]>,
      executeQuery(popularComplexesQuery, regionParams) as Promise<(RegionResult & { aptNm: string })[]>
    ]);

    // 최신 날짜로 일일 거래량 조회 (순차 실행 필요)
    const latestDateRow = latestDateResult[0];
    let latestVolumeRows: StatsResult[] = [];
    let latestDateStr: string | null = null;

    if (latestDateRow) {
      const { dealYear, dealMonth, dealDay } = latestDateRow;
      latestDateStr = `${dealYear}-${String(dealMonth).padStart(2, '0')}-${String(dealDay).padStart(2, '0')}`;

      latestVolumeRows = await executeQuery(
        latestVolumeQuery,
        (sido || sigungu) ? [...regionParams, dealYear, dealMonth, dealDay] : [dealYear, dealMonth, dealDay]
      ) as StatsResult[];
    }

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
      todayVolume: latestVolumeRows[0]?.count || 0,
      latestDate: latestDateStr, // YYYY-MM-DD 형식 문자열
      cancelledCount: cancelledRows[0]?.count || 0,
      trend: trendRows,
      popularComplexes: popularComplexes
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
