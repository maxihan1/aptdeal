import { executeQuery } from './mysql';

// 아파트 목록 조회
export async function getAptList(regionCode?: string) {
  let query = 'SELECT DISTINCT aptname FROM apt_deals WHERE aptname IS NOT NULL';
  const params: (string | number)[] = [];
  
  if (regionCode) {
    query += ' AND regionCode = ?';
    params.push(regionCode);
  }
  
  query += ' ORDER BY aptname LIMIT 1000';
  
  const rows = await executeQuery(query, params);
  return rows as Record<string, unknown>[];
}

// 아파트 실거래가 조회
export async function getAptDeals(aptName: string, regionCode?: string) {
  let query = `
    SELECT * FROM apt_deals 
    WHERE aptname = ?
  `;
  const params: (string | number)[] = [aptName];
  
  if (regionCode) {
    query += ' AND regionCode = ?';
    params.push(regionCode);
  }
  
  query += ' ORDER BY dealDate DESC';
  
  const rows = await executeQuery(query, params);
  return rows as Record<string, unknown>[];
}

// 지역별 아파트 목록 조회
export async function getAptsByRegion(regionCode: string) {
  const query = `
    SELECT DISTINCT aptname, COUNT(*) as dealCount 
    FROM apt_deals 
    WHERE regionCode = ? 
    GROUP BY aptname 
    ORDER BY dealCount DESC
  `;
  
  const rows = await executeQuery(query, [regionCode]);
  return rows as Record<string, unknown>[];
}

// 아파트 전월세 조회
export async function getAptRents(aptName: string, regionCode?: string) {
  let query = `
    SELECT * FROM apt_rents 
    WHERE aptname = ?
  `;
  const params: (string | number)[] = [aptName];
  
  if (regionCode) {
    query += ' AND regionCode = ?';
    params.push(regionCode);
  }
  
  query += ' ORDER BY dealDate DESC';
  
  const rows = await executeQuery(query, params);
  return rows as Record<string, unknown>[];
}

// 아파트 기본 정보 조회
export async function getAptInfo(kaptCode: string) {
  const query = 'SELECT * FROM apt WHERE kaptCode = ?';
  const rows = await executeQuery(query, [kaptCode]);
  return rows as Record<string, unknown>[];
}

// 지역별 실거래가 통계
export async function getRegionStats(regionCode: string) {
  const query = `
    SELECT 
      COUNT(*) as totalDeals,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      COUNT(DISTINCT aptname) as aptCount
    FROM apt_deals 
    WHERE regionCode = ?
  `;
  
  const rows = await executeQuery(query, [regionCode]);
  return rows as Record<string, unknown>[];
}

// 아파트별 실거래가 통계
export async function getAptStats(aptName: string, regionCode?: string) {
  let query = `
    SELECT 
      COUNT(*) as totalDeals,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      MIN(dealDate) as firstDeal,
      MAX(dealDate) as lastDeal
    FROM apt_deals 
    WHERE aptname = ?
  `;
  const params: (string | number)[] = [aptName];
  
  if (regionCode) {
    query += ' AND regionCode = ?';
    params.push(regionCode);
  }
  
  const rows = await executeQuery(query, params);
  return rows as Record<string, unknown>[];
} 