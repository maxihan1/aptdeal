
import axios from 'axios';

const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';
const BJD_CODE = '4113511400'; // 대장동

async function testListV1() {
    console.log("🚀 Testing AptListService (V1)...");

    // Service2 -> Service
    const url = `http://apis.data.go.kr/1613000/AptListService/getLegaldongAptList`;
    const directUrl = `${url}?serviceKey=${ENCODED_KEY}&bjdCode=${BJD_CODE}&numOfRows=100&pageNo=1`;

    try {
        console.log(`\nURL: ${directUrl}`);
        const res = await axios.get(directUrl);
        console.log("✅ Success! Status:", res.status);
        console.log("Data:", typeof res.data === 'string' ? res.data.substring(0, 500) : JSON.stringify(res.data).substring(0, 500));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Status:", e.response.status);
    }
}

testListV1();
