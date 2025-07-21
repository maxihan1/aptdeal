const express = require('express');
const next = require('next');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 환경 변수 설정
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// 공공데이터 API 키
const SERVICE_KEY = process.env.SERVICE_KEY || "PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL/bD8hsFzbNxSWZlbBhowKedMEw==";

// 지역 데이터 로드
const regionsPath = path.join(__dirname, "regions.json");
const regions = JSON.parse(fs.readFileSync(regionsPath, "utf-8"));
const regionsLawdPath = path.join(__dirname, "regions_with_lawdcd.json");
const regionsLawd = JSON.parse(fs.readFileSync(regionsLawdPath, "utf-8"));

// 시군구명 → lawd_cd 매핑 함수 (lawd_cd 직접 전달도 허용)
function getLawdCd(sido, sigungu) {
  if (/^\d{5}$/.test(sigungu)) return sigungu;
  const sigunguArr = regionsLawd.sigungu[sido] || [];
  const found = sigunguArr.find((item) => item.name === sigungu);
  return found && found.code ? found.code : null;
}

app.prepare().then(() => {
  const server = express();
  server.use(cors());
  server.use(express.json());

  // 지역 API 라우트
  server.get("/api/regions/provinces", (req, res) => {
    res.json(regions.sido);
  });
  server.get("/api/regions/cities", (req, res) => {
    const { province } = req.query;
    res.json(regions.sigungu[province] || []);
  });
  server.get("/api/regions/neighborhoods", (req, res) => {
    let { city } = req.query;
    city = decodeURIComponent((city || "").trim());
    res.json(regions.dong ? (regions.dong[city] || []) : []);
  });

  // 실거래가 API 연동
  server.get("/api/deals", async (req, res) => {
    const { sido, sigungu, dong, startDate, endDate } = req.query;
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
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        parsed = {};
      }
      const items = parsed.response?.body?.items?.item || [];
      const deals = Array.isArray(items) ? items : items ? [items] : [];
      const result = deals.map((deal, idx) => ({
        id: `${lawdCd}-${deal.일련번호 || idx}`,
        region: `${sido} ${sigungu} ${deal.법정동 || deal.umdNm || ''}`.trim(),
        address: deal.도로명 || deal.지번 || deal.jibun || '',
        area: Number(deal.전용면적 || deal.excluUseAr || 0),
        price: Number((deal.거래금액 || deal.dealAmount || '0').toString().replace(/,/g, '')),
        date: `${deal.년 || deal.dealYear || ''}-${String(deal.월 || deal.dealMonth || '').padStart(2, '0')}-${String(deal.일 || deal.dealDay || '').padStart(2, '0')}`,
        aptName: deal.아파트 || deal.aptNm || '',
        floor: deal.층 || deal.floor || '',
        buildYear: deal.건축년도 || deal.buildYear || '',
        dealMonth: deal.월 || deal.dealMonth || '',
        dealDay: deal.일 || deal.dealDay || '',
        tradeType: deal.거래유형 || deal.dealingGbn || deal.tradeType || '',
        cdealType: deal.계약해제 || deal.cdealType || '',
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "API 호출 실패", detail: e.message });
    }
  });

  // 루트 경로는 별도로 Next.js에 전달
  server.get('/', (req, res) => {
    return handle(req, res);
  });
  // Next.js 라우트 처리 (API 경로 제외)
  server.all('/*any', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    return handle(req, res);
  });

  const port = process.env.PORT || 3000;
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> API available at http://localhost:${port}/api`);
  });
}); 