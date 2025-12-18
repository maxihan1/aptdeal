
import axios from 'axios';

const SERVICE_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL/bD8hsFzbNxSWZlbBhowKedMEw==';
const BJD_CODE = '1111053000'; // 서울 종로구 사직동

async function test() {
    console.log("🔑 Testing API Key...");

    // Case 1: Axios Params (Auto Encoding)
    try {
        console.log("\n[Case 1] Axios params (Auto Encoding)");
        const res = await axios.get('http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList', {
            params: {
                serviceKey: SERVICE_KEY,
                bjdCode: BJD_CODE,
                numOfRows: 10,
                pageNo: 1
            }
        });
        console.log("✅ Success! Status:", res.status);
        console.log("Data snippet:", res.data.substring(0, 200));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Response:", e.response.status, e.response.statusText);
    }

    // Case 2: URL Direct with Encoding
    try {
        console.log("\n[Case 2] URL Direct (Manual Encoding)");
        const encodedKey = encodeURIComponent(SERVICE_KEY);
        const url = `http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList?serviceKey=${encodedKey}&bjdCode=${BJD_CODE}&numOfRows=10&pageNo=1`;

        const res = await axios.get(url);
        console.log("✅ Success! Status:", res.status);
        console.log("Data snippet:", res.data.substring(0, 200));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Response:", e.response.status, e.response.statusText);
    }

    // Case 3: URL Direct without Encoding (Decoding Key assumed as Encoding Key - Wrong but try)
    try {
        console.log("\n[Case 3] URL Direct (No Encoding)");
        const url = `http://apis.data.go.kr/1613000/AptListService2/getLegaldongAptList?serviceKey=${SERVICE_KEY}&bjdCode=${BJD_CODE}&numOfRows=10&pageNo=1`;

        const res = await axios.get(url);
        console.log("✅ Success! Status:", res.status);
        console.log("Data snippet:", res.data.substring(0, 200));
    } catch (e) {
        console.log("❌ Failed:", e.message);
        if (e.response) console.log("Response:", e.response.status, e.response.statusText);
    }
}

test();
