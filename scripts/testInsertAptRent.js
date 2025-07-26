require('dotenv').config();
"use strict";
const axios = require('axios');
const { supabase } = require("../src/lib/supabase");

const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';

async function fetchAllAptRents(params) {
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
    const { data, error } = await supabase.from('apt_deals').insert(batch);
    if (error) {
      console.error(`적재 실패 (batch ${i / batchSize + 1}):`, error);
    } else {
      console.log(`적재 성공 (batch ${i / batchSize + 1}): ${data ? data.length : 0}건`);
    }
  }
}

function insertTestRent(rents) {
    return new Promise(async (resolve) => {
        console.log('필터 전 rows:', rents.length);
        var rows = rents
            .filter(function(item) { return item.dealYear && item.dealMonth && item.dealDay; })
            .map(function (item) { return ({
                region: item.umdNm,
                address: item.도로명 || item.지번 || item.jibun || '',
                area: Number(item.excluUseAr || 0),
                price: null,
                date: `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`,
                apt_name: item.aptNm,
                floor: item.floor,
                build_year: item.buildYear,
                deal_month: item.dealMonth,
                deal_day: item.dealDay,
                trade_type: item.contractType || null,
                cdeal_type: null,
                deposit: item.deposit ? Number(String(item.deposit).replace(/,/g, '')) : null,
                monthly_rent: item.monthlyRent ? Number(String(item.monthlyRent).replace(/,/g, '')) : null,
                contract_type: item.contractType || null,
            }); });
        console.log('필터 후 insert rows:', rows.length);
        await batchInsert(rows, 100);
        resolve();
    });
}

(async () => {
  const params = {
    serviceKey: process.env.SERVICE_KEY, // 반드시 .env에 SERVICE_KEY가 있어야 함
    LAWD_CD: '11680', // 예: 강남구
    DEAL_YMD: '202212', // 예: 2022년 12월
    _type: 'json',
  };
  const allRents = await fetchAllAptRents(params);
  await insertTestRent(allRents);
})();
