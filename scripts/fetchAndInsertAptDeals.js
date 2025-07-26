require('dotenv').config();
const axios = require('axios');
const { supabase } = require('../src/lib/supabase');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const API_KEY = process.env.SERVICE_KEY;
const REGIONS_PATH = path.join(__dirname, '../regions_with_lawdcd.json');

function getLawdCodes() {
  const regions = JSON.parse(fs.readFileSync(REGIONS_PATH, 'utf-8'));
  const sigungu = regions.sigungu;
  let codes = [];
  Object.values(sigungu).forEach(arr => {
    arr.forEach(item => {
      if (item.code && item.code.length > 0) codes.push(item.code);
    });
  });
  return codes;
}

async function fetchAllAptDeals(params) {
  let allItems = [];
  let pageNo = 1;
  const numOfRows = 100;
  let hasMore = true;
  while (hasMore) {
    const response = await axios.get(API_URL, {
      params: {
        ...params,
        numOfRows,
        pageNo,
      }
    });
    // API 응답 전체를 로그로 출력
    console.log(`[${params.LAWD_CD}] ${params.DEAL_YMD} pageNo:${pageNo} API 응답:`, JSON.stringify(response.data));
    const items = response.data.response.body.items.item;
    if (!items || items.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(items);
      if (items.length < numOfRows) {
        hasMore = false;
      } else {
        pageNo++;
      }
    }
  }
  return allItems;
}

async function batchInsert(rows, batchSize = 100) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log('insert 시도 batch 샘플:', batch[0]);
    console.log('insert 시도 batch 개수:', batch.length);
    const { data, error } = await supabase.from('apt_deals').insert(batch);
    console.log('insert 결과:', data, error);
    if (error) {
      console.error(`적재 실패 (batch ${i / batchSize + 1}):`, error);
    } else {
      console.log(`적재 성공 (batch ${i / batchSize + 1}): ${data ? data.length : 0}건`);
    }
  }
}

function mapDealItems(items, lawdCd, yyyymm, pageNo) {
  const rows = items
    .filter(item => (item.년 || item.dealYear) && (item.월 || item.dealMonth) && (item.일 || item.dealDay))
    // 전국 모든 동 데이터 적재 (동 필터 제거)
    .map((item, idx) => ({
      id: `${lawdCd}-${yyyymm}-${pageNo}-${item.일련번호 || item.rnum || idx}`,
      region: String(item.법정동 || item.umdNm || ''),
      address: String(item.도로명 || item.지번 || item.jibun || ''),
      area: Number(item.전용면적 || item.excluUseAr || 0),
      price: item.거래금액 || item.dealAmount ? Number(String(item.거래금액 || item.dealAmount).replace(/,/g, '')) : null,
      date: `${item.년 || item.dealYear || ''}-${String(item.월 || item.dealMonth || '').padStart(2, '0')}-${String(item.일 || item.dealDay || '').padStart(2, '0')}`,
      aptname: String(item.아파트 || item.aptNm || ''),
      floor: item.층 !== undefined ? Number(item.층) : (item.floor !== undefined ? Number(item.floor) : null),
      buildyear: item.건축년도 !== undefined ? Number(item.건축년도) : (item.buildYear !== undefined ? Number(item.buildYear) : null),
      dealmonth: item.월 !== undefined ? Number(item.월) : (item.dealMonth !== undefined ? Number(item.dealMonth) : null),
      dealday: item.일 !== undefined ? Number(item.일) : (item.dealDay !== undefined ? Number(item.dealDay) : null),
      tradetype: String(item.거래유형 || item.dealingGbn || item.tradeType || ''),
      cdealtype: String(item.계약해제 || item.cdealType || ''),
    }));
  console.log('생성된 rows 샘플:', rows[0]);
  console.log('생성된 rows 개수:', rows.length);
  return rows;
}

const START_YEAR = 2006;
const END_YEAR = new Date().getFullYear();
const END_MONTH = new Date().getMonth() + 1;

(async () => {
  const codes = getLawdCodes();
  for (const lawdCd of codes) {
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === END_YEAR && month > END_MONTH) break;
        const yyyymm = `${year}${month.toString().padStart(2, '0')}`;
        const params = {
          serviceKey: API_KEY,
          LAWD_CD: lawdCd,
          DEAL_YMD: yyyymm,
          _type: 'json',
        };
        try {
          console.log(`[${lawdCd}] ${yyyymm} 매매 데이터 요청`);
          const deals = await fetchAllAptDeals(params);
          const rows = mapDealItems(deals, lawdCd, yyyymm, 1);
          console.log(`[${lawdCd}] ${yyyymm} 적재 rows:`, rows.length);
          await batchInsert(rows, 100);
        } catch (e) {
          console.error(`[${lawdCd}] ${yyyymm} 에러:`, e);
        }
      }
    }
  }
})(); 