
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('hogang_verification.json', 'utf8'));

console.log('=== 호갱노노 검증 결과 분석 ===\n');

let matched = 0;
let mismatched = 0;
let noData = 0;

const mismatchList = [];
const matchedList = [];

data.forEach(item => {
    const dealYear = item.deal_year;
    const hogangResult = item.hogang_result;

    if (!hogangResult || hogangResult === 'N/A' || !hogangResult.data?.matched?.apt?.list) {
        noData++;
        return;
    }

    const aptList = hogangResult.data.matched.apt.list;
    if (aptList.length === 0) {
        noData++;
        return;
    }

    // 첫 번째 결과의 start_date에서 년도 추출
    const firstApt = aptList[0];
    const startDate = firstApt.start_date;
    const hogangYear = startDate ? parseInt(startDate.substring(0, 4)) : null;

    if (!hogangYear) {
        noData++;
        return;
    }

    const diff = Math.abs(dealYear - hogangYear);

    if (diff <= 2) {
        matched++;
        matchedList.push({
            id: item.id,
            name: item.deal_apt_name,
            dong: item.umd_nm,
            dealYear,
            hogangYear,
            diff
        });
    } else {
        mismatched++;
        mismatchList.push({
            id: item.id,
            name: item.deal_apt_name,
            dong: item.umd_nm,
            dealYear,
            hogangYear,
            hogangName: firstApt.name,
            diff,
            currentMapping: item.basis_apt_name
        });
    }
});

console.log('=== 요약 ===');
console.log(`일치 (±2년): ${matched}건`);
console.log(`불일치: ${mismatched}건`);
console.log(`데이터 없음: ${noData}건`);

console.log('\n=== 일치 케이스 (현재 K-apt 매핑이 틀렸지만 실제 아파트는 존재) ===');
matchedList.forEach(m => {
    console.log(`[${m.id}] ${m.name}(${m.dong}): 실거래=${m.dealYear}, 호갱=${m.hogangYear}`);
});

console.log('\n=== 불일치 케이스 (K-apt 매핑 삭제 검토) ===');
mismatchList.forEach(m => {
    console.log(`[${m.id}] ${m.name}(${m.dong}): 실거래=${m.dealYear} → 호갱=${m.hogangName}(${m.hogangYear}) | 현재: ${m.currentMapping}`);
});
