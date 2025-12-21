/**
 * 사이드바 섹션 타입 정의
 * 확장 가능한 섹션 기반 구조
 */

// 기본 정보
export interface BasicInfo {
    id: string;
    name: string;
    address: string;
    householdCount?: number;
    dongCount?: number;
    parkingRatio?: number; // 세대당 주차 대수
    buildYear?: string;
    floors?: number;
    avgArea?: number;
}

// 가격 정보
export interface PriceInfo {
    avgPrice: number;
    pricePerPyeong: number;
    price30d: number;
    price90d: number;
    price365d: number;
    dealCount30d: number;
    lastDealPrice: number;
    lastDealDate?: string;
}

// 면적별 매매가 (실제 면적 기준)
export interface PriceByArea {
    area: string;      // "59㎡", "84㎡" 등
    avgPrice: number;
    count: number;
}

// 면적별 전세가
export interface RentPriceByArea {
    area: string;
    avgDeposit: number;
    count: number;
}

// 최근 매매
export interface RecentDeal {
    price: number;
    area: number;
    floor: number;
    date: string;
}

// 전월세 정보
export interface RentInfo {
    deposit: number;
    monthlyRent: number;
    area: number;
    floor: number;
    date: string;
    type: '전세' | '월세';
}

// 가격 추이
export interface PriceTrend {
    month: string;
    [key: string]: string | number;  // 동적 면적별 가격
}

// 전세 추이
export interface RentTrend {
    month: string;
    avgDeposit?: number;
    dealCount?: number;
    [key: string]: string | number | undefined;
}

// 주변 시세
export interface NearbyApartment {
    id: string;
    name: string;
    householdCount: number;
    avgPrice: number;
    pricePerPyeong?: number;  // 평당가 (만원)
}

// 학군 정보
export interface SchoolInfo {
    elementary?: {
        name: string;
        distance: number;
    };
    middle?: {
        name: string;
        distance: number;
    };
    high?: {
        name: string;
        distance: number;
    };
}

// 전체 사이드바 데이터
export interface SidebarData {
    basic: BasicInfo;
    price: PriceInfo;
    priceByArea: PriceByArea[];
    rentPriceByArea?: RentPriceByArea[];
    recentDeals?: RecentDeal[];
    recentRents: RentInfo[];
    priceTrend: PriceTrend[];
    rentTrend: RentTrend[];
    nearby: NearbyApartment[];
    school: SchoolInfo | null;
}

// 섹션 컴포넌트 props 타입
export interface SectionProps<T> {
    data: T;
    isLoading?: boolean;
}
