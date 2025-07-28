# 구글 서치 콘솔 등록 가이드

APTDEAL 웹사이트를 구글 서치 콘솔에 등록하여 검색 엔진 최적화(SEO)를 위한 상세 가이드입니다.

## 1. 구글 서치 콘솔 접속

1. [Google Search Console](https://search.google.com/search-console)에 접속
2. 구글 계정으로 로그인

## 2. 속성 추가

### 2.1 도메인 속성 (권장)
- **속성 유형**: 도메인
- **도메인**: `aptdeal.kr`
- **장점**: 모든 하위 도메인과 프로토콜(HTTP/HTTPS)을 포함

### 2.2 URL 접두어 속성 (대안)
- **속성 유형**: URL 접두어
- **URL**: `https://aptdeal.kr`
- **장점**: 특정 프로토콜과 하위 도메인만 포함

## 3. 소유권 확인

### 3.1 HTML 태그 방법 (권장)

1. **HTML 태그 복사**:
   ```
   <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE" />
   ```

2. **코드 적용**:
   - `src/app/layout.tsx` 파일에서 다음 라인을 찾아 수정:
   ```tsx
   <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE" />
   ```
   - `YOUR_VERIFICATION_CODE`를 구글에서 제공한 실제 코드로 교체

3. **배포 및 확인**:
   ```bash
   npm run build
   npm run dev  # 또는 프로덕션 배포
   ```

4. **소유권 확인**:
   - 구글 서치 콘솔에서 "확인" 버튼 클릭

### 3.2 HTML 파일 방법

1. **HTML 파일 다운로드**:
   - 구글에서 제공하는 HTML 파일 다운로드

2. **파일 업로드**:
   - `public/` 디렉토리에 파일 업로드
   - 예: `public/google1234567890.html`

3. **접근 확인**:
   - `https://aptdeal.kr/google1234567890.html` 접근 가능한지 확인

4. **소유권 확인**:
   - 구글 서치 콘솔에서 "확인" 버튼 클릭

### 3.3 DNS 레코드 방법

1. **TXT 레코드 추가**:
   - 도메인 관리자 페이지에서 DNS 설정
   - TXT 레코드 추가: `@` → `google-site-verification=YOUR_CODE`

2. **전파 대기**:
   - DNS 전파 시간 대기 (최대 72시간)

3. **소유권 확인**:
   - 구글 서치 콘솔에서 "확인" 버튼 클릭

## 4. Sitemap 제출

### 4.1 Sitemap URL
```
https://aptdeal.kr/sitemap.xml
```

### 4.2 제출 방법
1. **Sitemaps 메뉴** 클릭
2. **새 사이트맵 추가** 클릭
3. **사이트맵 URL 입력**: `sitemap.xml`
4. **제출** 버튼 클릭

### 4.3 Sitemap 내용 확인
- 정적 페이지: 메인 페이지, 지역별 조회 페이지
- 동적 페이지: 아파트별 상세 페이지 (최대 1000개)
- 자동 업데이트: 빌드 시 데이터베이스에서 최신 정보 가져옴

## 5. Robots.txt 확인

### 5.1 Robots.txt URL
```
https://aptdeal.kr/robots.txt
```

### 5.2 내용 확인
```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /private/

Sitemap: https://aptdeal.kr/sitemap.xml
```

## 6. URL 검사 및 색인 생성

### 6.1 URL 검사
1. **URL 검사 도구** 사용
2. **테스트 URL 입력**: `https://aptdeal.kr`
3. **검사 요청** 클릭
4. **결과 확인**: 색인 생성 가능 여부 확인

### 6.2 색인 생성 요청
1. **색인 생성 요청** 버튼 클릭
2. **요청 제출** 확인
3. **처리 시간**: 일반적으로 몇 시간에서 며칠 소요

## 7. 성능 모니터링

### 7.1 검색 성능
- **검색 결과**: 사이트가 검색 결과에 나타나는 빈도
- **클릭률**: 검색 결과에서 클릭되는 비율
- **평균 위치**: 검색 결과에서의 평균 순위

### 7.2 색인 생성 상태
- **색인 생성된 페이지**: 구글에 색인된 페이지 수
- **제외된 페이지**: 색인에서 제외된 페이지 및 이유

## 8. 추가 최적화

### 8.1 메타 태그 최적화
- 각 페이지에 적절한 title과 description 설정
- Open Graph 태그 추가 (소셜 미디어 공유용)

### 8.2 구조화된 데이터
- JSON-LD 스키마 마크업 추가
- 아파트 정보, 가격 정보 등 구조화

### 8.3 페이지 속도 최적화
- 이미지 최적화
- 코드 스플리팅
- 캐싱 전략

## 9. 문제 해결

### 9.1 소유권 확인 실패
- HTML 태그가 올바른 위치에 있는지 확인
- 배포가 완료되었는지 확인
- 캐시를 지우고 다시 시도

### 9.2 Sitemap 오류
- XML 형식이 올바른지 확인
- URL이 접근 가능한지 확인
- 파일 크기가 50MB 이하인지 확인

### 9.3 색인 생성 지연
- 구글 크롤러가 사이트에 접근할 수 있는지 확인
- robots.txt 설정 확인
- 사이트 속도 개선

## 10. 정기 관리

### 10.1 월간 체크리스트
- [ ] 검색 성능 리포트 확인
- [ ] 색인 생성 상태 확인
- [ ] Sitemap 업데이트 확인
- [ ] 오류 및 경고 확인

### 10.2 분기별 체크리스트
- [ ] SEO 전략 검토
- [ ] 경쟁사 분석
- [ ] 키워드 성과 분석
- [ ] 사용자 행동 분석

## 참고 자료

- [Google Search Console 도움말](https://support.google.com/webmasters/)
- [Sitemap 가이드](https://developers.google.com/search/docs/advanced/sitemaps/overview)
- [SEO 시작하기 가이드](https://developers.google.com/search/docs/beginner/seo-starter-guide) 