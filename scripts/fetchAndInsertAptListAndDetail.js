// 임시 주석 처리 - 나중에 다시 사용 예정
/*
// ESM 모듈 스타일로 변경
import 'dotenv/config';
import axios from 'axios';
import { supabase } from '../src/lib/supabase.js';

const SERVICE_KEY = process.env.SERVICE_KEY;
*/

/*
async function fetchAllAptList() {
  let pageNo = 1;
  const numOfRows = 1000;
  let allApts = [];
  while (true) {
    const url = 'https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3';
    const params = {
      serviceKey: SERVICE_KEY,
      pageNo,
      numOfRows,
      _type: 'json',
    };
    const { data } = await axios.get(url, { params });
    console.log(`[API 응답 pageNo=${pageNo}]`, JSON.stringify(data));
    const items = data?.response?.body?.items;
    if (!items || items.length === 0) break;
    allApts = allApts.concat(items);
    if (items.length < numOfRows) break;
    pageNo++;
  }
  return allApts;
}
*/

/*
async function fetchAptDetail(kaptCode) {
  const url = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4';
  const params = {
    serviceKey: SERVICE_KEY,
    kaptCode,
    _type: 'json',
  };
  try {
    const { data } = await axios.get(url, { params });
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
    const { data, error } = await supabase.from('apt').upsert(batch, { onConflict: ['kaptcode'] });
    if (error) {
      console.error(`[upsert 실패]`, error);
    } else {
      console.log(`[upsert 성공] ${data ? data.length : 0}건`);
    }
  }
}
*/

/*
async function main() {
  const aptList = await fetchAllAptList();
  console.log(`[API] 전체 단지 수: ${aptList.length}`);

  let mergedRows = [];
  for (const apt of aptList) {
    const detail = await fetchAptDetail(apt.kaptCode);
    const merged = {
      kaptCode: apt.kaptCode,
      kaptName: apt.kaptName,
      as1: apt.as1,
      as2: apt.as2,
      as3: apt.as3,
      as4: apt.as4,
      bjdCode: apt.bjdCode,
      zipcode: detail.zipcode,
      kaptAddr: detail.kaptAddr,
      codeSaleNm: detail.codeSaleNm,
      codeHeatNm: detail.codeHeatNm,
      kaptTarea: detail.kaptTarea,
      kaptDongCnt: detail.kaptDongCnt,
      kaptdaCnt: detail.kaptdaCnt,
      kaptBcompany: detail.kaptBcompany,
      kaptAcompany: detail.kaptAcompany,
      kaptTel: detail.kaptTel,
      kaptFax: detail.kaptFax,
      kaptUrl: detail.kaptUrl,
      codeAptNm: detail.codeAptNm,
      doroJuso: detail.doroJuso,
      hoCnt: detail.hoCnt,
      codeMgrNm: detail.codeMgrNm,
      codeHallNm: detail.codeHallNm,
      kaptUsedate: detail.kaptUsedate,
      kaptMarea: detail.kaptMarea,
      kaptMparea60: detail.kaptMparea60,
      kaptMparea85: detail.kaptMparea85,
      kaptMparea135: detail.kaptMparea135,
      kaptMparea136: detail.kaptMparea136,
      privArea: detail.privArea,
      kaptTopFloor: detail.kaptTopFloor,
      ktownFlrNo: detail.ktownFlrNo,
      kaptBaseFloor: detail.kaptBaseFloor,
      kaptdEcntp: detail.kaptdEcntp,
    };
    mergedRows.push(merged);
    if (mergedRows.length >= 100) {
      await batchUpsert(mergedRows, 100);
      mergedRows = [];
    }
    console.log(`[준비] ${merged.kaptCode} ${merged.kaptName}`);
    await new Promise(res => setTimeout(res, 100)); // API 과호출 방지
  }
  if (mergedRows.length > 0) {
    await batchUpsert(mergedRows, 100);
  }
  console.log('완료!');
}

main();
*/ 