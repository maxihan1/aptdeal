import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sido = searchParams.get('sido');
    const sigungu = searchParams.get('sigungu');
    const dong = searchParams.get('dong');
    const aptName = searchParams.get('aptName');

    if (!sido || !sigungu || !dong || !aptName) {
      return NextResponse.json(
        { error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 아파트 세대수 정보 조회 (JOIN을 이용한 효율적 조회)
    const query = `
      SELECT 
        b.kaptCode,
        b.kaptName,
        b.kaptdaCnt as totalHouseholds,
        b.kaptDongCnt as totalParking,
        b.kaptUsedate as constructionYear,
        b.kaptAddr as address
      FROM apt_list a
      JOIN apt_basis_info b ON a.kaptCode = b.kaptCode
      WHERE a.as1 = ? AND a.as2 = ? AND a.as3 = ? AND a.kaptName = ?
      LIMIT 1
    `;
    
    const result = await executeQuery(query, [sido, sigungu, dong, aptName]);

    // result가 배열인지 확인하고 길이 체크
    if (!result || !Array.isArray(result) || result.length === 0) {
      return NextResponse.json(
        { error: '해당 아파트 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0]
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 