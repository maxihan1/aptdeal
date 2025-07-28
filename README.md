# APTDEAL - 아파트 실거래가 조회 서비스

아파트 실거래가를 쉽게 조회할 수 있는 웹 서비스입니다.

## 주요 기능

- 전국 아파트 실거래가 조회
- 지역별 필터링
- 아파트별 상세 정보
- 면적별 거래 내역
- 월세 정보 조회

## 기술 스택

- **Frontend**: Next.js 15, React, TypeScript
- **UI**: Tailwind CSS, ShadCN UI
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

## 환경 변수 설정

`.env.local` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Analytics
NEXT_PUBLIC_GA_TRACKING_ID=your_ga_tracking_id

# 사이트 URL (프로덕션 환경)
NEXT_PUBLIC_BASE_URL=https://aptdeal.kr
```

## SEO 및 검색 엔진 최적화

### Sitemap 설정

프로젝트에는 자동으로 생성되는 sitemap.xml이 포함되어 있습니다:

- **정적 페이지**: 메인 페이지, 지역별 조회 페이지
- **동적 페이지**: 아파트별 상세 페이지, 면적별 페이지
- **자동 업데이트**: 빌드 시 데이터베이스에서 최신 아파트 목록을 가져와 sitemap 생성

### Robots.txt

검색 엔진 크롤링을 위한 robots.txt가 자동으로 생성됩니다:

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /private/

Sitemap: https://aptdeal.kr/sitemap.xml
```

### 구글 서치 콘솔 등록

1. **Google Search Console**에 접속
2. **속성 추가** → **도메인** 또는 **URL 접두어** 선택
3. **소유권 확인**:
   - HTML 파일 업로드
   - HTML 태그 추가
   - DNS 레코드 추가
4. **Sitemap 제출**:
   - `https://aptdeal.kr/sitemap.xml` 제출
5. **URL 검사** 및 **색인 생성 요청**

### 추가 SEO 최적화

- **메타 태그**: 각 페이지에 적절한 title, description 설정
- **구조화된 데이터**: JSON-LD 스키마 마크업 추가
- **이미지 최적화**: Next.js Image 컴포넌트 사용
- **성능 최적화**: 코드 스플리팅, 지연 로딩 적용

## 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 루트 레이아웃
│   ├── page.tsx           # 메인 페이지
│   ├── region/            # 지역별 조회
│   ├── sitemap.ts         # Sitemap 생성
│   └── robots.ts          # Robots.txt 생성
├── components/            # 재사용 가능한 컴포넌트
│   ├── ui/               # ShadCN UI 컴포넌트
│   └── Sidebar.tsx       # 사이드바 컴포넌트
├── lib/                  # 유틸리티 함수
│   ├── supabase.ts       # Supabase 클라이언트
│   └── gtag.ts           # Google Analytics
└── types/                # TypeScript 타입 정의
```

## 배포

### Vercel 배포

1. **Vercel CLI 설치**:
   ```bash
   npm i -g vercel
   ```

2. **배포**:
   ```bash
   vercel
   ```

3. **환경 변수 설정**:
   - Vercel 대시보드에서 환경 변수 설정
   - `NEXT_PUBLIC_BASE_URL`을 프로덕션 URL로 설정

### 도메인 설정

1. **커스텀 도메인 추가**:
   - Vercel 대시보드 → Settings → Domains
   - `aptdeal.kr` 도메인 추가

2. **DNS 설정**:
   - A 레코드: `@` → Vercel IP
   - CNAME 레코드: `www` → `aptdeal.kr`

## 라이선스

MIT License

## 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
