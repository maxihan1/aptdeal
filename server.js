// ES 모듈 방식으로 전체 변환
import express from 'express';
import next from 'next';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 [STARTUP] Starting server initialization...');
console.log('📁 [STARTUP] Working directory:', __dirname);
console.log('🔧 [STARTUP] NODE_ENV:', process.env.NODE_ENV);

dotenv.config();

console.log('🔐 [STARTUP] Environment variables loaded');
console.log('🗄️  [STARTUP] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('🔑 [STARTUP] Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
console.log('🌐 [STARTUP] API URL:', process.env.NEXT_PUBLIC_API_URL || 'NOT SET');

const dev = process.env.NODE_ENV !== 'production';
console.log('⚙️  [STARTUP] Development mode:', dev);

const app = next({ dev });
const handle = app.getRequestHandler();

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 공공데이터 API 키
const SERVICE_KEY = process.env.SERVICE_KEY || "PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL/bD8hsFzbNxSWZlbBhowKedMEw==";

// 지역 데이터 로드
console.log('📄 [DATA] Loading regions data...');
const regionsPath = path.join(__dirname, "regions.json");
console.log('📄 [DATA] Regions file path:', regionsPath);

try {
  const regions = JSON.parse(fs.readFileSync(regionsPath, "utf-8"));
  console.log('✅ [DATA] Regions data loaded successfully');
} catch (error) {
  console.error('❌ [DATA] Failed to load regions.json:', error.message);
  process.exit(1);
}
const regions = JSON.parse(fs.readFileSync(regionsPath, "utf-8"));

// LAWD_CD.txt 파일 파싱하여 시도-시군구별 동 매핑 생성
console.log('📄 [DATA] Loading LAWD_CD data...');
const lawdCdPath = path.join(__dirname, "LAWD_CD.txt");
const lawdCdData = fs.readFileSync(lawdCdPath, "utf-8");
const sidoSigunguDongMapping = {};

console.log('📄 [DATA] Parsing LAWD_CD data...');
const lines = lawdCdData.split('\n');
for (let i = 1; i < lines.length; i++) { // 첫 번째 줄은 헤더이므로 건너뜀
  const line = lines[i].trim();
  if (!line) continue;
  
  const parts = line.split('\t');
  if (parts.length >= 3 && parts[2] === '존재') {
    const fullName = parts[1];
    
    // 지역명을 공백으로 분리
    const nameParts = fullName.split(/\s+/);
    let sido, sigungu, dong, key, si, gu;
    
    if (nameParts.length === 4) {
      // 4개 부분: "경기도 용인시 기흥구 신갈동" 형태
      [sido, si, gu, dong] = nameParts;
      sigungu = `${si} ${gu}`;
      key = `${sido}-${sigungu}`;
    } else if (nameParts.length === 3) {
      // 3개 부분: "경기도 수원시 팔달동" 형태
      [sido, sigungu, dong] = nameParts;
      key = `${sido}-${sigungu}`;
    } else if (nameParts.length === 2) {
      // 2개 부분: "세종특별자치시 반곡동" 형태
      [sido, dong] = nameParts;
      sigungu = "세종시"; // UI에서 선택하는 시군구명
      key = `${sido}-${sigungu}`;
    }
    
    // 동 이름이 있고, 구/군/시로 끝나지 않는 경우만 추가
    if (key && dong && dong.trim() && 
        !dong.endsWith('구') && !dong.endsWith('군') && !dong.endsWith('시')) {
      if (!sidoSigunguDongMapping[key]) {
        sidoSigunguDongMapping[key] = [];
      }
      
      // 중복 제거
      if (!sidoSigunguDongMapping[key].find(d => d.name === dong)) {
        sidoSigunguDongMapping[key].push({
          code: dong,
          name: dong
        });
      }
    }
  }
}

console.log('✅ [DATA] LAWD_CD data parsed successfully');
console.log('📊 [DATA] Number of sido-sigungu combinations:', Object.keys(sidoSigunguDongMapping).length);

const regionsLawdPath = path.join(__dirname, "regions_with_lawdcd.json");
console.log('📄 [DATA] Regions LAWD file path:', regionsLawdPath);

try {
  const regionsLawd = JSON.parse(fs.readFileSync(regionsLawdPath, "utf-8"));
  console.log('✅ [DATA] Regions LAWD data loaded successfully');
} catch (error) {
  console.error('❌ [DATA] Failed to load regions_with_lawdcd.json:', error.message);
  process.exit(1);
}
const regionsLawd = JSON.parse(fs.readFileSync(regionsLawdPath, "utf-8"));

// 시군구명 → lawd_cd 매핑 함수 (lawd_cd 직접 전달도 허용)
function getLawdCd(sido, sigungu) {
  if (/^\d{5}$/.test(sigungu)) return sigungu;
  const sigunguArr = regionsLawd.sigungu[sido] || [];
  
  // 1. 정확한 매칭 시도
  let found = sigunguArr.find((item) => item.name === sigungu);
  if (found && found.code) return found.code;
  
  // 2. "시 + 구" 형태인 경우, 시만 매칭 시도 (예: "부천시 원미구" → "부천시")
  if (sigungu.includes(' ')) {
    const si = sigungu.split(' ')[0];
    found = sigunguArr.find((item) => item.name === si);
    if (found && found.code) {
      console.log(`[getLawdCd] "${sigungu}" → "${si}" 매핑: ${found.code}`);
      return found.code;
    }
  }
  
  console.log(`[getLawdCd] "${sigungu}" 매핑 실패`);
  return null;
}

console.log('🎯 [NEXT] Preparing Next.js app...');
app.prepare().then(() => {
  console.log('✅ [NEXT] Next.js app prepared successfully');
  
  const server = express();
  server.use(express.json());
  
  console.log('🌐 [EXPRESS] Express server created');
  
  // Health check endpoint for AppPass
  server.get('/health', (req, res) => {
    console.log('💓 [HEALTH] Health check requested');
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV 
    });
  });

  // 지역 API 라우트
  server.get("/api/regions/provinces", (req, res) => {
    res.json(regions.sido);
  });
  server.get("/api/regions/cities", (req, res) => {
    const { province } = req.query;
    res.json(regions.sigungu[province] || []);
  });
  server.get("/api/regions/neighborhoods", (req, res) => {
    let { province, city } = req.query;
    city = decodeURIComponent((city || "").trim());
    province = decodeURIComponent((province || "").trim());
    
    // 시도와 시군구가 모두 제공된 경우, LAWD_CD 기반 매핑 사용
    if (province && city) {
      const key = `${province}-${city}`;
      const dongList = sidoSigunguDongMapping[key] || [];
      
      console.log(`[neighborhoods] Request: ${province} ${city}, Found ${dongList.length} dongs`);
      res.json(dongList);
      return;
    }
    
    // 시도나 시군구가 제공되지 않은 경우 빈 배열 반환
    console.log('[neighborhoods] Missing province or city parameter');
    res.json([]);
  });

  // YYYYMM 리스트 생성 함수
  function getMonthList(startDate, endDate) {
    const result = [];
    let current = new Date(startDate.slice(0, 7) + '-01');
    const end = new Date(endDate.slice(0, 7) + '-01');
    while (current <= end) {
      const y = current.getFullYear();
      const m = (current.getMonth() + 1).toString().padStart(2, '0');
      result.push(`${y}${m}`);
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }

  // 실거래가 API 연동
  server.get("/api/deals", async (req, res) => {
    const { sido, sigungu, dong, startDate, endDate, dealType } = req.query;
    const lawdCd = getLawdCd(sido, sigungu);
    if (!lawdCd || !startDate || !endDate) return res.json([]);
    try {
      const allDeals = [];
      const months = getMonthList(startDate, endDate);
      for (const dealYmd of months) {
        let pageNo = 1;
        while (true) {
          let url, params;
          if (dealType === "rent") {
            url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";
            params = {
              serviceKey: SERVICE_KEY,
              LAWD_CD: lawdCd,
              DEAL_YMD: dealYmd,
              numOfRows: 100,
              pageNo,
            };
          } else {
            url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
            params = {
              serviceKey: SERVICE_KEY,
              LAWD_CD: lawdCd,
              DEAL_YMD: dealYmd,
              numOfRows: 100,
              pageNo,
            };
          }
          console.log("[공공데이터 API 요청]", url, params);
          const { data } = await axios.get(url, { params, responseType: "text" });
          console.log("[공공데이터 API 응답 일부]", typeof data === 'string' ? data.slice(0, 500) : data);
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = {};
          }
          const items = parsed.response?.body?.items?.item || [];
          const deals = Array.isArray(items) ? items : items ? [items] : [];
          if (deals.length === 0) break;
          if (dealType === "rent") {
            allDeals.push(...deals.map((deal, idx) => {
              const address = deal.jibun ? String(deal.jibun) : '';
              return {
                id: `${lawdCd}-${dealYmd}-${pageNo}-${deal.일련번호 || deal.rnum || idx}`,
                region: `${sido} ${sigungu} ${deal.법정동 || deal.umdNm || ''}`.trim(),
                address,
                area: Number(deal.전용면적 || deal.excluUseAr || 0),
                deposit: Number((deal.deposit || deal.보증금액 || deal.rentGtn || '0').toString().replace(/,/g, '')),
                rent: Number((deal.monthlyRent || deal.월세금액 || deal.rentFee || '0').toString().replace(/,/g, '')),
                rentType: deal.contractType || deal.임대구분 || deal.rentGbn || '',
                date: `${deal.dealYear || deal.년 || ''}-${String(deal.dealMonth || deal.월 || '').padStart(2, '0')}-${String(deal.dealDay || deal.일 || '').padStart(2, '0')}`,
                aptName: deal.아파트 || deal.aptNm || '',
                buildYear: deal.건축년도 || deal.buildYear || '',
              };
            }));
          } else {
            allDeals.push(...deals.map((deal, idx) => ({
              id: `${lawdCd}-${dealYmd}-${pageNo}-${deal.일련번호 || deal.rnum || idx}`,
              region: `${sido} ${sigungu} ${deal.법정동 || deal.umdNm || ''}`.trim(),
              address: (deal.지번 ? String(deal.지번) : (deal.jibun ? String(deal.jibun) : '')) || deal.도로명 || '',
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
            })));
          }
          if (deals.length < 100) break;
          pageNo++;
        }
      }
      // id 기준 중복 제거
      const uniqueDeals = Object.values(allDeals.reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
      }, {}));
      console.log(`[가공된 deals] 총 ${uniqueDeals.length}건, 샘플:`, uniqueDeals[0]);
      res.json(uniqueDeals);
    } catch (e) {
      res.status(500).json({ error: "API 호출 실패", detail: e.message });
    }
  });

  // 전월세(rent) API 라우트
  server.get("/api/rent", async (req, res) => {
    const { sido, sigungu, dong, startDate, endDate } = req.query;
    const lawdCd = getLawdCd(sido, sigungu);
    if (!lawdCd || !startDate || !endDate) return res.json([]);
    try {
      const allDeals = [];
      const months = getMonthList(startDate, endDate);
      for (const dealYmd of months) {
        let pageNo = 1;
        while (true) {
          const url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";
          const params = {
            serviceKey: SERVICE_KEY,
            LAWD_CD: lawdCd,
            DEAL_YMD: dealYmd,
            numOfRows: 100,
            pageNo,
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
          if (deals.length === 0) break;
          allDeals.push(...deals.map((deal, idx) => {
            const address = deal.jibun ? String(deal.jibun) : '';
            return {
              id: `${lawdCd}-${dealYmd}-${pageNo}-${deal.일련번호 || deal.rnum || idx}`,
              region: `${sido} ${sigungu} ${deal.법정동 || deal.umdNm || ''}`.trim(),
              address,
              area: Number(deal.전용면적 || deal.excluUseAr || 0),
              deposit: Number((deal.deposit || deal.보증금액 || deal.rentGtn || '0').toString().replace(/,/g, '')),
              rent: Number((deal.monthlyRent || deal.월세금액 || deal.rentFee || '0').toString().replace(/,/g, '')),
              rentType: deal.contractType || deal.임대구분 || deal.rentGbn || '',
              date: `${deal.dealYear || deal.년 || ''}-${String(deal.dealMonth || deal.월 || '').padStart(2, '0')}-${String(deal.dealDay || deal.일 || '').padStart(2, '0')}`,
              aptName: deal.아파트 || deal.aptNm || '',
              buildYear: deal.건축년도 || deal.buildYear || '',
            };
          }));
          if (deals.length < 100) break;
          pageNo++;
        }
      }
      // id 기준 중복 제거
      const uniqueDeals = Object.values(allDeals.reduce((acc, cur) => {
        acc[cur.id] = cur;
        return acc;
      }, {}));
      res.json(uniqueDeals);
    } catch (e) {
      res.status(500).json({ error: "API 호출 실패", detail: e.message });
    }
  });

  // 단지 총 세대수 조회 API
  server.get('/api/apt-households', async (req, res) => {
    const { sido, sigungu, dong, aptName } = req.query;
    console.log('[apt-households] params:', { sido, sigungu, dong, aptName });
    if (!sido || !sigungu || !dong || !aptName) {
      return res.status(400).json({ error: '필수 파라미터 누락' });
    }
    try {
      const { data, error } = await supabase
        .from('apt')
        .select('kaptdacnt')
        .eq('as1', sido)
        .eq('as2', sigungu)
        .eq('as3', dong)
        .eq('kaptname', aptName)
        .limit(1)
        .single();
      if (error) {
        console.error('[apt-households] supabase error:', error);
        return res.status(500).json({ error: error.message });
      }
      res.json({ kaptdaCnt: data ? Number(data.kaptdacnt) : null });
    } catch (e) {
      console.error('[apt-households] catch error:', e);
      res.status(500).json({ error: e.message });
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
  console.log('🚀 [SERVER] Starting server on port:', port);
  
  server.listen(port, '0.0.0.0', (err) => {
    if (err) {
      console.error('❌ [SERVER] Failed to start server:', err);
      process.exit(1);
    }
    console.log('🎉 [SERVER] Server started successfully!');
    console.log(`📍 [SERVER] Server running on http://0.0.0.0:${port}`);
    console.log(`🔗 [SERVER] API available at http://0.0.0.0:${port}/api`);
    console.log(`💓 [SERVER] Health check at http://0.0.0.0:${port}/health`);
    console.log('✨ [SERVER] Ready to receive requests!');
  });
}).catch(error => {
  console.error('❌ [NEXT] Failed to prepare Next.js app:', error);
  process.exit(1);
}); 