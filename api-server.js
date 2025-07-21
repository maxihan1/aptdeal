require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

const SERVICE_KEY = "PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL/bD8hsFzbNxSWZlbBhowKedMEw==";

// regions.json: 동(읍면동) 조회용
const regionsPath = path.join(__dirname, "regions.json");
const regions = JSON.parse(fs.readFileSync(regionsPath, "utf-8"));
// regions_with_lawdcd.json: lawd_cd 매핑용
const regionsLawdPath = path.join(__dirname, "regions_with_lawdcd.json");
const regionsLawd = JSON.parse(fs.readFileSync(regionsLawdPath, "utf-8"));

// 시도 목록
app.get("/api/regions/sido", (req, res) => {
  res.json(regions.sido);
});
// 시군구 목록
app.get("/api/regions/sigungu", (req, res) => {
  const { sido } = req.query;
  res.json(regions.sigungu[sido] || []);
});
// 읍면동 목록
app.get("/api/regions/dong", (req, res) => {
  let { sigungu } = req.query;
  sigungu = decodeURIComponent((sigungu || "").trim());
  res.json(regions.dong ? (regions.dong[sigungu] || []) : []);
});

// 시군구명 → lawd_cd 매핑 함수 (lawd_cd 직접 전달도 허용)
function getLawdCd(sido, sigungu) {
  // lawd_cd(5자리) 직접 전달 시
  if (/^\d{5}$/.test(sigungu)) return sigungu;
  const sigunguArr = regionsLawd.sigungu[sido] || [];
  const found = sigunguArr.find((item) => item.name === sigungu);
  return found && found.code ? found.code : null;
}

// 실거래가 API 연동
app.get("/api/deals", async (req, res) => {
  const { sido, sigungu, dong, startDate, endDate } = req.query;
  // LAWD_CD: 시군구코드, DEAL_YMD: YYYYMM
  const lawdCd = getLawdCd(sido, sigungu);
  if (!lawdCd || !startDate) return res.json([]);
  const dealYmd = startDate.replace(/-/g, "").slice(0, 6);
  try {
    const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade`;
    const params = {
      serviceKey: SERVICE_KEY,
      LAWD_CD: lawdCd,
      DEAL_YMD: dealYmd,
      numOfRows: 100,
      pageNo: 1,
    };
    const { data } = await axios.get(url, { params, responseType: "text" });
    // 원본 XML(또는 JSON) 전체 출력
    console.log('원본 응답:', data);
    let parsed;
    try {
      parsed = JSON.parse(data);
      console.log('JSON으로 파싱됨');
    } catch (e) {
      console.error('JSON 파싱 실패:', e);
      parsed = {};
    }
    // 파싱 결과 전체 구조 출력
    console.log('파싱 결과:', JSON.stringify(parsed, null, 2));
    const items = parsed.response?.body?.items?.item || [];
    // 추가 콘솔 로그: items, deals 길이, 타입
    console.log('items:', items, 'type:', typeof items, 'isArray:', Array.isArray(items));
    const deals = Array.isArray(items) ? items : items ? [items] : [];
    console.log('deals.length:', deals.length);
    // 필요한 필드만 가공
    const result = deals.map((deal, idx) => ({
      id: `${lawdCd}-${deal.일련번호 || idx}`,
      region: `${sido} ${sigungu} ${deal.법정동 || deal.umdNm || ''}`.trim(),
      address: deal.도로명 || deal.지번 || deal.jibun || '',
      area: Number(deal.전용면적 || deal.excluUseAr || 0),
      price: Number((deal.거래금액 || deal.dealAmount || '0').toString().replace(/,/g, '')),
      date: `${deal.년 || deal.dealYear || ''}-${String(deal.월 || deal.dealMonth || '').padStart(2, '0')}-${String(deal.일 || deal.dealDay || '').padStart(2, '0')}`,
      aptName: deal.아파트 || deal.aptNm || '', // 단지명
      floor: deal.층 || deal.floor || '',       // 층
      buildYear: deal.건축년도 || deal.buildYear || '', // 건축년도
      dealMonth: deal.월 || deal.dealMonth || '', // 계약월
      dealDay: deal.일 || deal.dealDay || '',     // 계약일
      // 필요시 추가 필드
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "API 호출 실패", detail: e.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
}); 