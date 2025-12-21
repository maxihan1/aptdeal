# 🏠 아파트 실거래가 데이터 로더

국토교통부 공공데이터 API를 통해 10년치 아파트 실거래가 데이터를 안전하게 적재하는 스크립트입니다.

## 📁 파일 구조

```
data-loader/
├── README.md                    # 이 문서
├── 01_setup_tables.js          # 필요한 테이블 생성
├── 02_load_apt_deals.js        # 매매 실거래가 적재
├── 03_load_apt_rents.js        # 전월세 실거래가 적재
├── 04_verify_data.js           # 데이터 검증
├── 05_recover_missing.js       # 누락 데이터 복구
├── 06_daily_sync.js            # 일일/주간 자동 동기화 ⭐ NEW
└── utils/
    ├── db.js                   # DB 연결
    ├── api.js                  # API 호출 (재시도 로직)
    └── logger.js               # 로깅
```

## 🚀 사용 방법

### 1단계: 테이블 생성
```bash
node src/scripts/data-loader/01_setup_tables.js
```

### 2단계: 매매 실거래가 적재
```bash
# 전체 적재 (2015년 ~ 현재)
node src/scripts/data-loader/02_load_apt_deals.js

# 특정 연도만 적재
node src/scripts/data-loader/02_load_apt_deals.js --year=2015

# 특정 기간 적재
node src/scripts/data-loader/02_load_apt_deals.js --start-year=2015 --end-year=2020
```

### 3단계: 전월세 실거래가 적재
```bash
node src/scripts/data-loader/03_load_apt_rents.js
```

### 4단계: 데이터 검증
```bash
node src/scripts/data-loader/04_verify_data.js
```

### 5단계: 누락 데이터 복구 (필요시)
```bash
node src/scripts/data-loader/05_recover_missing.js
```

### 6단계: 자동 동기화 스케줄러 ⭐ NEW
```bash
# 일일 동기화 (최근 3개월)
node src/scripts/data-loader/06_daily_sync.js --mode=daily

# 주간 동기화 (최근 6개월)
node src/scripts/data-loader/06_daily_sync.js --mode=weekly
```

#### 📅 크론탭 설정 (macOS/Linux)
```bash
# 크론탭 편집
crontab -e

# 매일 새벽 4시 - 최근 3개월 동기화 (매매/전월세 + 캐시)
0 4 * * * cd /Users/maxi.moff/APT\ value/web && node src/scripts/data-loader/06_daily_sync.js --mode=daily >> sync_daily.log 2>&1

# 매주 화요일 새벽 5시 - 최근 6개월 동기화 + 신규 단지 보완 작업
0 5 * * 2 cd /Users/maxi.moff/APT\ value/web && node src/scripts/data-loader/06_daily_sync.js --mode=weekly >> sync_weekly.log 2>&1
```

#### 🔧 주간 모드 추가 작업 (weekly only)
- **displayName 업데이트**: 카카오 검색으로 신규 단지 표시명 수집 (최대 200개)
- **좌표 수집**: 좌표 없는 단지에 카카오 지오코딩으로 좌표 추가 (최대 100개)
- **K-apt 매핑**: 미매핑 단지에 지번 기반 K-apt 코드 매핑 시도 (최대 100개)

| 기능 | 설명 |
|------|------|
| **체크포인트** | 진행 상황을 DB에 저장, 중단 시 자동 재개 |
| **멱등성** | `ON DUPLICATE KEY UPDATE`로 중복 안전 처리 |
| **지수 백오프** | API 실패 시 1초→2초→4초 대기 후 재시도 |
| **배치 INSERT** | 500건씩 묶어서 INSERT (성능 최적화) |
| **실시간 검증** | API 건수 vs DB 건수 비교 |
| **Dead Letter Queue** | 반복 실패 요청 별도 저장 |

## ⚠️ 주의사항

1. `.env` 파일에 `SERVICE_KEY`가 설정되어 있어야 합니다.
2. 공공데이터 포털 API는 분당 300회 호출 제한이 있습니다.
3. 전체 10년치 적재 시 수 시간이 소요될 수 있습니다.
4. 중간에 중단해도 다시 실행하면 마지막 지점부터 재개됩니다.

## 📊 예상 소요 시간

| 데이터 | 예상 시간 |
|--------|----------|
| 매매 (10년) | 약 3-5시간 |
| 전월세 (10년) | 약 4-6시간 |

## 🔧 환경 변수

```env
# .env 파일에 필요한 변수
SERVICE_KEY=your_public_data_api_key
MYSQL_HOST=your_mysql_host
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=your_database_name
```
