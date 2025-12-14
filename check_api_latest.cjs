const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const https = require('https');

const SERVICE_KEY = process.env.SERVICE_KEY;

// 서울 강남구 코드
const REGION_CODE = '11680';
const DEAL_YMD = '202512';

const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?serviceKey=${encodeURIComponent(SERVICE_KEY)}&LAWD_CD=${REGION_CODE}&DEAL_YMD=${DEAL_YMD}&pageNo=1&numOfRows=100`;

console.log('=== 공공데이터 API에서 2025년 12월 서울 강남구 데이터 조회 ===\n');

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        // XML 파싱 (간단히)
        const itemMatches = data.match(/<item>([\s\S]*?)<\/item>/g);
        if (!itemMatches) {
            console.log('데이터 없음 또는 에러');
            console.log('Response:', data.substring(0, 500));
            return;
        }

        console.log(`총 ${itemMatches.length}건 조회됨\n`);

        // dealDay 추출하여 날짜별 카운트
        const dayCounts = {};
        itemMatches.forEach(item => {
            const dayMatch = item.match(/<dealDay>(\d+)<\/dealDay>/);
            if (dayMatch) {
                const day = parseInt(dayMatch[1]);
                dayCounts[day] = (dayCounts[day] || 0) + 1;
            }
        });

        console.log('=== API에서 조회된 날짜별 거래 수 ===');
        Object.keys(dayCounts).sort((a, b) => b - a).forEach(day => {
            console.log(`2025-12-${String(day).padStart(2, '0')}: ${dayCounts[day]}건`);
        });

        // 가장 최신 날짜 확인
        const maxDay = Math.max(...Object.keys(dayCounts).map(Number));
        console.log(`\n=== 가장 최신 데이터: 2025-12-${String(maxDay).padStart(2, '0')} ===`);
    });
}).on('error', err => {
    console.error('API 호출 에러:', err.message);
});
