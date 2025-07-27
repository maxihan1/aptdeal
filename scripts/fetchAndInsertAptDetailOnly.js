// 임시 주석 처리 - 나중에 다시 사용 예정
/*
import 'dotenv/config';
import axios from 'axios';
import { supabase } from '../src/lib/supabase.js';

const SERVICE_KEY = process.env.SERVICE_KEY;
*/

/*
async function fetchAptDetail(kaptCode) {
  // [수정] 베이스 정보 API로 변경
  const url = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4';
  const params = {
    ServiceKey: SERVICE_KEY,
    kaptCode,
    _type: 'json',
  };
  try {
    // 실제 호출 URL 로그
    const fullUrl = url + '?' + new URLSearchParams(params).toString();
    console.log('[API 호출]', fullUrl);
    const { data } = await axios.get(url, { params });
    // 응답 전체 로그
    console.log('[API 응답]', JSON.stringify(data));
    // [수정] 베이스 정보 API 응답 파싱
    return data?.response?.body?.item || {};
  } catch (e) {
    console.error('[상세조회 실패]', kaptCode, e.message);
    return {};
  }
}
*/

/*
async function batchUpsert(rows, batchSize = 100) {
  function toLowerCaseKeys(obj) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
    );
  }
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(toLowerCaseKeys);

    // [추가] upsert 직전 row 데이터 로그
    console.log('[upsert 시도] batch:', JSON.stringify(batch, null, 2));

    // [선택] upsert 전 DB 상태(주석 해제 시 사용)
    // const { data: before, error: beforeErr } = await supabase.from('apt').select('*').in('kaptcode', batch.map(r => r.kaptcode));
    // console.log('[upsert 전 DB]', JSON.stringify(before, null, 2));

    const { data, error, status } = await supabase.from('apt').upsert(batch, { onConflict: ['kaptcode'] });

    // [추가] upsert 결과 상세 로그
    console.log('[upsert 결과] status:', status, 'data:', data, 'error:', error);

    if (error) {
      console.error(`[upsert 실패]`, error);
    } else {
      console.log(`[upsert 성공] ${data ? data.length : 0}건`);
      // [추가] upsert 결과가 0건일 때, DB 상태를 바로 확인
      if (!data || (Array.isArray(data) && data.length === 0)) {
        const kaptcodes = batch.map(r => r.kaptcode);
        const { data: dbRows, error: dbError } = await supabase.from('apt').select('*').in('kaptcode', kaptcodes);
        if (dbError) {
          console.error('[DB 상태 조회 실패]', dbError);
        } else {
          console.log('[DB 상태 - upsert 0건일 때]', JSON.stringify(dbRows, null, 2));
        }
      }
    }

    // [선택] upsert 후 DB 상태(주석 해제 시 사용)
    // const { data: after, error: afterErr } = await supabase.from('apt').select('*').in('kaptcode', batch.map(r => r.kaptcode));
    // console.log('[upsert 후 DB]', JSON.stringify(after, null, 2));
  }
}
*/

/*
async function main() {
  // 1. Supabase DB에서 kaptCode 목록 조회
  const { data: aptList, error } = await supabase.from('apt').select('kaptcode');
  if (error) {
    console.error('[DB 조회 실패]', error);
    return;
  }
  if (!aptList || aptList.length === 0) {
    console.error('[DB] 단지 데이터가 없습니다.');
    return;
  }
  // [수정] 전체 데이터 처리로 복구
  console.log(`[DB] 단지 수: ${aptList.length}`);

  let detailRows = [];
  for (const apt of aptList) {
    const kaptCode = apt.kaptcode;
    const detail = await fetchAptDetail(kaptCode);
    if (!detail || Object.keys(detail).length === 0) {
      console.log(`[상세 없음] ${kaptCode}`);
      continue;
    }
    // kaptCode 포함, 상세 필드만 upsert
    const row = { kaptCode, ...detail };
    detailRows.push(row);
    if (detailRows.length >= 100) {
      await batchUpsert(detailRows, 100);
      detailRows = [];
    }
    console.log(`[상세 준비] ${kaptCode}`);
    await new Promise(res => setTimeout(res, 100)); // API 과호출 방지
  }
  if (detailRows.length > 0) {
    await batchUpsert(detailRows, 100);
  }
  console.log('상세정보 채우기 완료!');
}

main();
*/ 