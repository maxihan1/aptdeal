import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface SearchResult {
  aptName: string;       // 표시명: "읍면동 아파트명"
  aptNm: string;         // apt_deal_info 원본명 (URL에 사용)
  region: string;        // "시도 시군구 읍면동"
  sido: string;
  sigungu: string;
  dong: string;
  householdCount?: number;
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
        aptNm,
        umdNm as dong,
        sido,
        sigungu,
        CONCAT(sido, ' ', sigungu, ' ', umdNm) as region,
        CONCAT(umdNm, ' ', aptNm) as displayName,
        householdCount,
        dealCount,
        aptNmNormalized,
        -- 유사도 점수 계산
        CASE 
          -- 정확히 일치
          WHEN aptNmNormalized = ? COLLATE utf8mb4_unicode_ci THEN 100
          -- 검색어로 시작
          WHEN aptNmNormalized LIKE CONCAT(?, '%') COLLATE utf8mb4_unicode_ci THEN 90
          -- 동 이름 정확히 일치
          WHEN umdNmNormalized = ? COLLATE utf8mb4_unicode_ci THEN 80
          -- 검색어 포함
          WHEN aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci THEN 70
          -- 동 이름 포함
          WHEN umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci THEN 60
          -- 지역명(시군구) 포함 + 아파트명 포함 (복합 검색)
          WHEN (sigungu LIKE CONCAT('%', ?, '%') OR sido LIKE CONCAT('%', ?, '%')) THEN 50
          ELSE 40
        END as relevanceScore
      FROM apt_search_index
      WHERE 
        -- 아파트명 매칭 (공백 무시)
        aptNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
        -- OR 동 이름 매칭
        OR umdNmNormalized LIKE CONCAT('%', ?, '%') COLLATE utf8mb4_unicode_ci
        -- OR 지역+아파트 복합 검색 (2단어 이상일 때)
        OR (
          ? >= 2 AND (
            (sigungu LIKE CONCAT('%', ?, '%') AND aptNmNormalized LIKE CONCAT('%', ?, '%'))
            OR (sido LIKE CONCAT('%', ?, '%') AND aptNmNormalized LIKE CONCAT('%', ?, '%'))
          )
        )
      ORDER BY 
        relevanceScore DESC,
        dealCount DESC
      LIMIT 15
    `;

    // 파라미터 준비
    const firstPart = searchParts[0] || searchTermNormalized;
    const lastPart = searchParts.length > 1 ? searchParts[searchParts.length - 1].replace(/\s+/g, '') : searchTermNormalized;

    const params = [
      searchTermNormalized,  // 정확일치
      searchTermNormalized,  // 시작
      searchTermNormalized,  // 동 정확일치
      searchTermNormalized,  // 포함
      searchTermNormalized,  // 동 포함
      firstPart,              // 지역명 시군구
      firstPart,              // 지역명 시도
      searchTermNormalized,  // WHERE 아파트명
      searchTermNormalized,  // WHERE 동이름
      searchParts.length,     // 단어 개수
      firstPart,              // 복합: 시군구
      lastPart,               // 복합: 아파트명
      firstPart,              // 복합: 시도
      lastPart                // 복합: 아파트명
    ];

    const rows = await executeQuery(sql, params) as any[];

    const results: SearchResult[] = rows.map(row => ({
      aptName: row.displayName,
      aptNm: row.aptNm,
      region: row.region,
      sido: row.sido,
      sigungu: row.sigungu,
      dong: row.dong,
      householdCount: row.householdCount || 0,
      dealCount: row.dealCount || 0
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
