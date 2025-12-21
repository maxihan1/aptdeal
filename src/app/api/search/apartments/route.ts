import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface SearchResult {
  aptName: string;       // 표시명: "읍면동 정식단지명"
  aptNm: string;         // apt_deal_info 원본명 (URL에 사용)
  region: string;        // "시도 시군구 읍면동"
  sido: string;
  sigungu: string;
  dong: string;
  householdCount?: number;
  kaptCode?: string;     // K-apt 단지코드 (주소 기반 매핑)
  jibun?: string;        // 지번 주소
  officialName?: string; // 정식 단지명 (카카오명 우선)
  lat?: number;          // 위도
  lng?: number;          // 경도
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json([]);
    }

    // 검색어 정규화: 공백 제거
    const searchTerm = query.trim();
    const searchTermNormalized = searchTerm.replace(/\s+/g, '');

    // 검색어를 공백으로 분리 (지역+아파트 검색 지원)
    const searchParts = searchTerm.split(/\s+/).filter(p => p.length > 0);

    // 검색 조건:
    // 1. 정규화된 아파트명에 검색어 포함
    // 2. 동 이름에 검색어 포함
    // 3. 지역명 + 아파트명 복합 검색
    //
    // 정렬 우선순위:
    // 1. 유사도 (정확일치 > 시작 > 포함)
    // 2. 세대수 많은 순

    const sql = `
      SELECT 
        s.aptNm,
        s.umdNm as dong,
        s.sido,
        s.sigungu,
        CONCAT(s.sido, ' ', s.sigungu, ' ', s.umdNm) as region,
        CONCAT(s.umdNm, ' ', COALESCE(s.displayName, s.aptNm)) as displayNameFull,
        COALESCE(s.displayName, s.aptNm) as officialName,
        s.householdCount,
        s.dealCount,
        s.aptNmNormalized,
        s.kapt_code as kaptCode,
        s.jibun,
        b.latitude as lat,
        b.longitude as lng,
        -- 유사도 점수 계산
        CASE 
          -- 동+아파트 복합 검색 (동천동 써니 -> 동천동 써니벨리)
          WHEN ? >= 2 AND s.umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
               AND s.aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci THEN 95
          -- 정확히 일치
          WHEN s.aptNmNormalized = ? COLLATE utf8mb4_unicode_ci THEN 100
          -- 검색어로 시작
          WHEN s.aptNmNormalized LIKE CONCAT(?, '%') COLLATE utf8mb4_unicode_ci THEN 90
          -- 동 이름 정확히 일치
          WHEN s.umdNmNormalized = ? COLLATE utf8mb4_unicode_ci THEN 80
          -- 검색어 포함
          WHEN s.aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci THEN 70
          -- 동 이름 포함
          WHEN s.umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci THEN 60
          -- 지역명(시군구) 포함 + 아파트명 포함 (복합 검색)
          WHEN (s.sigungu LIKE CONCAT('%', ?, '%') OR s.sido LIKE CONCAT('%', ?, '%')) THEN 50
          ELSE 40
        END as relevanceScore
      FROM apt_search_index s
      LEFT JOIN apt_basic_info b ON s.kapt_code COLLATE utf8mb4_unicode_ci = b.kaptCode COLLATE utf8mb4_unicode_ci
      WHERE 
        -- 아파트명 매칭 (공백 무시)
        s.aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
        -- OR 동 이름 매칭
        OR s.umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
        -- OR 동+아파트 복합 검색 (2단어 이상일 때)
        OR (
          ? >= 2 AND 
          s.umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci AND 
          s.aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
        )
        -- OR 지역+아파트 복합 검색 (2단어 이상일 때)
        OR (
          ? >= 2 AND (
            (s.sigungu LIKE CONCAT('%', ?, '%') AND s.aptNmNormalized LIKE CONCAT('%', ?, '%'))
            OR (s.sido LIKE CONCAT('%', ?, '%') AND s.aptNmNormalized LIKE CONCAT('%', ?, '%'))
          )
        )
      ORDER BY 
        relevanceScore DESC,
        s.dealCount DESC
      LIMIT 15
    `;

    // 파라미터 준비
    const firstPart = searchParts[0] || searchTermNormalized;
    const lastPart = searchParts.length > 1 ? searchParts[searchParts.length - 1].replace(/\s+/g, '') : searchTermNormalized;

    const params = [
      // CASE 문 파라미터
      searchParts.length,     // 동+아파트 복합: 단어개수
      firstPart,              // 동+아파트 복합: 동 이름
      lastPart,               // 동+아파트 복합: 아파트명
      searchTermNormalized,   // 정확일치
      searchTermNormalized,   // 시작
      searchTermNormalized,   // 동 정확일치
      searchTermNormalized,   // 포함
      searchTermNormalized,   // 동 포함
      firstPart,              // 지역명 시군구
      firstPart,              // 지역명 시도
      // WHERE 문 파라미터
      searchTermNormalized,   // WHERE 아파트명
      searchTermNormalized,   // WHERE 동이름
      searchParts.length,     // 동+아파트 복합: 단어개수
      firstPart,              // 동+아파트 복합: 동 이름
      lastPart,               // 동+아파트 복합: 아파트명
      searchParts.length,     // 지역+아파트 복합: 단어개수
      firstPart,              // 복합: 시군구
      lastPart,               // 복합: 아파트명
      firstPart,              // 복합: 시도
      lastPart                // 복합: 아파트명
    ];

    const rows = await executeQuery(sql, params) as any[];

    const results: SearchResult[] = rows.map(row => ({
      aptName: row.displayNameFull,
      aptNm: row.aptNm,
      region: row.region,
      sido: row.sido,
      sigungu: row.sigungu,
      dong: row.dong,
      householdCount: row.householdCount || 0,
      dealCount: row.dealCount || 0,
      kaptCode: row.kaptCode && row.kaptCode !== 'UNMAPPED' ? row.kaptCode : undefined,
      jibun: row.jibun || undefined,
      officialName: row.officialName,
      lat: row.lat ? parseFloat(row.lat) : undefined,
      lng: row.lng ? parseFloat(row.lng) : undefined,
    }));

    return NextResponse.json(results);

  } catch (error) {
    console.error('[Search API Error]', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
