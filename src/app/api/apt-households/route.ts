import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/mysql';

interface AptInfoRow {
  kaptCode: string;
  kaptName: string;
  totalHouseholds: number;
  totalParking: number;
  constructionYear: string;
  address: string;
  // apt_detail_info fields
  codeMgr: string;
  kaptCcompany: string;
  codeStr: string;
  kaptdPcnt: string;
  kaptdPcntu: string;
  subwayLine: string;
  subwayStation: string;
  welfareFacility: string;
  groundElChargerCnt: number;
  undergroundElChargerCnt: number;
}

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

    // 아파트 세대수 + 상세정보 조회 (apt_detail_info JOIN 추가)
    const query = `
      SELECT 
        b.kaptCode,
        b.kaptName,
        b.kaptdaCnt as totalHouseholds,
        b.kaptDongCnt as totalParking,
        b.kaptUsedate as constructionYear,
        b.kaptAddr as address,
        d.codeMgr,
        d.kaptCcompany,
        d.codeStr,
        d.kaptdPcnt,
        d.kaptdPcntu,
        d.subwayLine,
        d.subwayStation,
        d.welfareFacility,
        d.groundElChargerCnt,
        d.undergroundElChargerCnt
      FROM apt_list a
      JOIN apt_basis_info b ON a.kaptCode = b.kaptCode
      LEFT JOIN apt_detail_info d ON a.kaptCode = d.kaptCode
      WHERE a.as1 = ? AND a.as2 = ? AND a.as3 = ? AND a.kaptName = ?
      LIMIT 1
    `;

    const result = await executeQuery(query, [sido, sigungu, dong, aptName]) as AptInfoRow[];

    if (!result || !Array.isArray(result) || result.length === 0) {
      return NextResponse.json(
        { error: '해당 아파트 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const row = result[0];

    // 복리시설을 배열로 변환
    const welfareFacilities = row.welfareFacility
      ? row.welfareFacility.split(',').map(s => s.trim()).filter(s => s)
      : [];

    return NextResponse.json({
      success: true,
      // 기존 필드
      kaptCode: row.kaptCode,
      kaptName: row.kaptName,
      kaptdaCnt: row.totalHouseholds,
      totalParking: row.totalParking,
      constructionYear: row.constructionYear,
      address: row.address,
      // 신규 필드 (apt_detail_info)
      managementType: row.codeMgr || '',
      managementCompany: row.kaptCcompany || '',
      structureType: row.codeStr || '',
      parking: {
        ground: parseInt(row.kaptdPcnt) || 0,
        underground: parseInt(row.kaptdPcntu) || 0
      },
      subway: {
        line: row.subwayLine || '',
        station: row.subwayStation || ''
      },
      welfareFacilities,
      evChargers: {
        ground: row.groundElChargerCnt || 0,
        underground: row.undergroundElChargerCnt || 0
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
