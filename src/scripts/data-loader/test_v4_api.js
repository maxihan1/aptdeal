
import axios from 'axios';

// 사용자가 제공한 인코딩된 키 (복붙)
// URL 파라미터로 쓸 때는 이미 인코딩된 이 값을 그대로 써야 함
// axios params에 넣을 땐 인코딩된 값을 decodeURIComponent 해서 넣어야 함 (axios가 다시 인코딩 하므로)
const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';
const DECODED_KEY = decodeURIComponent(ENCODED_KEY);

const KAPT_CODE = 'A10020533';

async function testV4() {
    console.log("🚀 Testing AptBasisInfoServiceV4...");

    const url = `https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4`;

    // 방법 1: ServiceKey를 URL에 직접 추가 (인코딩된 키 그대로)
    const directUrl = `${url}?serviceKey=${ENCODED_KEY}&kaptCode=${KAPT_CODE}`;

    try {
        console.log(`\n[Try 1] Direct URL: ${directUrl}`);
        const res = await axios.get(directUrl);
        console.log("✅ Success! Status:", res.status);
        console.log("Data Type:", typeof res.data);
        console.log("Response Data:", typeof res.data === 'string' ? res.data.substring(0, 500) : JSON.stringify(res.data).substring(0, 500));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Status:", e.response.status);
    }
}

testV4();

async function testList() {
    console.log("🚀 Testing AptListService2 (List API)...");
    const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';
    const BJD_CODE = '4113511400'; // 대장동

    const url = `http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList`;
    const directUrl = `${url}?serviceKey=${ENCODED_KEY}&bjdCode=${BJD_CODE}&numOfRows=100&pageNo=1`;

    try {
        console.log(`\n[Try List] Direct URL: ${directUrl}`);
        const res = await axios.get(directUrl);
        console.log("✅ Success! Status:", res.status);
        console.log("Data:", typeof res.data === 'string' ? res.data.substring(0, 500) : JSON.stringify(res.data).substring(0, 500));

        // XML에서 포레스트 찾기
        if (typeof res.data === 'string' && res.data.includes('포레스트')) {
            console.log("🎯 Found '포레스트' in response!");
        }
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Status:", e.response.status);
    }
}

testList();
