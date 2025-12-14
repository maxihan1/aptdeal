-- 대시보드 통계 캐시 테이블
CREATE TABLE IF NOT EXISTS dashboard_stats_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    region_code VARCHAR(20) NOT NULL,        -- 'ALL' 또는 시도명 (예: '서울특별시')
    stat_type VARCHAR(50) NOT NULL,          -- 'topRegion', 'monthlyVolume', 'todayVolume', 'cancelledCount'
    stat_value JSON NOT NULL,                -- 통계 값 (JSON 형태로 유연하게 저장)
    latest_deal_date VARCHAR(10),            -- 최신 거래일 (YYYY-MM-DD)
    calculated_at DATETIME NOT NULL,         -- 계산 시간
    UNIQUE KEY uk_region_stat (region_code, stat_type),
    INDEX idx_calculated_at (calculated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
