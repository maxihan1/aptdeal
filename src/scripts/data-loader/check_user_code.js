
import axios from 'axios';

const ENCODED_KEY = 'PofsBo9KhzreP4I5ULYO0sqoysrTnQGpozz8JfdTSltOOYpJALPKFhZncnaL%2FbD8hsFzbNxSWZlbBhowKedMEw%3D%3D';
const KAPT_CODE_FROM_USER = 'A10027875';

async function checkUserCode() {
    console.log(`🚀 Checking code ${KAPT_CODE_FROM_USER} with V4 API...`);
    const url = `https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4?serviceKey=${ENCODED_KEY}&kaptCode=${KAPT_CODE_FROM_USER}`;

    try {
        const res = await axios.get(url);
        console.log("✅ Success! Data:", typeof res.data === 'string' ? res.data.substring(0, 500) : JSON.stringify(res.data).substring(0, 500));
    } catch (e) {
        console.log("❌ Failed:", e.message);
    }
}

checkUserCode();
