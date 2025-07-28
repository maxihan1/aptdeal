import fetch from 'node-fetch';

async function checkMetaTags(url) {
  console.log(`🔍 메타태그 확인 중: ${url}`);
  
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('\n📋 확인된 메타태그:');
    
    // 네이버 서치어드바이저
    const naverMatch = html.match(/<meta[^>]*name="naver-site-verification"[^>]*>/i);
    if (naverMatch) {
      console.log('✅ 네이버 서치어드바이저:', naverMatch[0]);
    } else {
      console.log('❌ 네이버 서치어드바이저 메타태그를 찾을 수 없습니다.');
    }
    
    // 구글 서치 콘솔
    const googleMatch = html.match(/<meta[^>]*name="google-site-verification"[^>]*>/i);
    if (googleMatch) {
      console.log('✅ 구글 서치 콘솔:', googleMatch[0]);
    } else {
      console.log('❌ 구글 서치 콘솔 메타태그를 찾을 수 없습니다.');
    }
    
    // 제목
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      console.log('✅ 페이지 제목:', titleMatch[1]);
    }
    
    // 설명
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
    if (descMatch) {
      console.log('✅ 페이지 설명:', descMatch[1]);
    }
    
    // 키워드
    const keywordsMatch = html.match(/<meta[^>]*name="keywords"[^>]*content="([^"]*)"/i);
    if (keywordsMatch) {
      console.log('✅ 페이지 키워드:', keywordsMatch[1].substring(0, 100) + '...');
    }
    
    // Open Graph
    const ogMatches = html.match(/<meta[^>]*property="og:[^"]*"[^>]*>/gi);
    if (ogMatches) {
      console.log('✅ Open Graph 태그:', ogMatches.length + '개');
      ogMatches.forEach(tag => {
        const propertyMatch = tag.match(/property="og:([^"]*)"/);
        const contentMatch = tag.match(/content="([^"]*)"/);
        if (propertyMatch && contentMatch) {
          console.log(`   - og:${propertyMatch[1]}: ${contentMatch[1]}`);
        }
      });
    }
    
    // Twitter Card
    const twitterMatches = html.match(/<meta[^>]*name="twitter:[^"]*"[^>]*>/gi);
    if (twitterMatches) {
      console.log('✅ Twitter Card 태그:', twitterMatches.length + '개');
      twitterMatches.forEach(tag => {
        const nameMatch = tag.match(/name="twitter:([^"]*)"/);
        const contentMatch = tag.match(/content="([^"]*)"/);
        if (nameMatch && contentMatch) {
          console.log(`   - twitter:${nameMatch[1]}: ${contentMatch[1]}`);
        }
      });
    }
    
    console.log('\n✅ 메타태그 확인 완료!');
    
  } catch (error) {
    console.error('❌ 메타태그 확인 실패:', error.message);
  }
}

// 로컬 서버 확인
checkMetaTags('http://localhost:3001');

// 실제 도메인 확인 (배포 후 사용)
// checkMetaTags('https://aptdeal.kr'); 