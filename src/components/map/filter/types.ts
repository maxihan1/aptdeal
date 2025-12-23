// Map Filter Types

export interface PriceRange {
    min: number; // 만원 단위
    max: number; // 만원 단위
}

export type TransactionType = 'sale' | 'rent';
export type YearBuiltFilter = 'all' | '5' | '10' | '15' | '20';

export interface MapFilters {
    transactionType: TransactionType;
    priceRange: PriceRange;
    yearBuilt: YearBuiltFilter;
    favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: MapFilters = {
    transactionType: 'sale',
    priceRange: { min: 0, max: 500000 }, // 0 ~ 50억
    yearBuilt: 'all',
    favoritesOnly: false,
};

export const PRICE_MARKS = [
    { value: 0, label: '0' },
    { value: 50000, label: '5억' },
    { value: 100000, label: '10억' },
    { value: 200000, label: '20억' },
    { value: 300000, label: '30억' },
    { value: 500000, label: '50억' },
];

export const YEAR_BUILT_OPTIONS = [
    { value: 'all', label: '전체' },
    { value: '5', label: '5년 이내' },
    { value: '10', label: '10년 이내' },
    { value: '15', label: '15년 이내' },
    { value: '20', label: '20년 이내' },
] as const;
