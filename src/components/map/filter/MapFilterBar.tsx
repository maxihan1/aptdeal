'use client';

import { cn } from '@/lib/utils';
import { Home, Key, Star, X } from 'lucide-react';
import { useCallback } from 'react';
import { MapFilters, TransactionType, YearBuiltFilter, YEAR_BUILT_OPTIONS, DEFAULT_FILTERS } from './types';

// 가격 프리셋 옵션
const PRICE_PRESETS = [
    { label: '전체', min: 0, max: 500000 },
    { label: '~5억', min: 0, max: 50000 },
    { label: '5~10억', min: 50000, max: 100000 },
    { label: '10~20억', min: 100000, max: 200000 },
    { label: '20억~', min: 200000, max: 500000 },
];

interface MapFilterBarProps {
    filters: MapFilters;
    onFiltersChange: (filters: MapFilters) => void;
    onExpandedChange?: (expanded: boolean) => void;
    favoritesCount: number;
    className?: string;
}

export default function MapFilterBar({
    filters,
    onFiltersChange,
    onExpandedChange,
    favoritesCount,
    className,
}: MapFilterBarProps) {

    const handleTransactionChange = useCallback((type: TransactionType) => {
        onFiltersChange({ ...filters, transactionType: type });
    }, [filters, onFiltersChange]);

    const handleYearBuiltChange = useCallback((year: YearBuiltFilter) => {
        onFiltersChange({ ...filters, yearBuilt: year });
    }, [filters, onFiltersChange]);

    const handleFavoritesToggle = useCallback(() => {
        onFiltersChange({ ...filters, favoritesOnly: !filters.favoritesOnly });
    }, [filters, onFiltersChange]);

    const handlePricePreset = useCallback((min: number, max: number) => {
        onFiltersChange({ ...filters, priceRange: { min, max } });
    }, [filters, onFiltersChange]);

    const formatPrice = (value: number) => {
        if (value >= 10000) {
            return `${Math.floor(value / 10000)}억`;
        }
        return `${value / 100}천`;
    };

    const getCurrentPriceLabel = () => {
        const { min, max } = filters.priceRange;
        const preset = PRICE_PRESETS.find(p => p.min === min && p.max === max);
        if (preset) return preset.label;
        return `${formatPrice(min)}~${formatPrice(max)}`;
    };

    const hasActiveFilters =
        filters.transactionType !== 'sale' ||
        filters.yearBuilt !== 'all' ||
        filters.favoritesOnly ||
        filters.priceRange.min > 0 ||
        filters.priceRange.max < 500000;

    const resetFilters = useCallback(() => {
        onFiltersChange(DEFAULT_FILTERS);
    }, [onFiltersChange]);

    return (
        <div className={cn("bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800", className)}>
            {/* Main Filter Bar - 모바일 반응형 */}
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:py-2 overflow-x-auto scrollbar-hide">
                {/* 매매/전월세 토글 */}
                <div className="flex bg-zinc-800 rounded-lg p-0.5 flex-shrink-0">
                    <button
                        onClick={() => handleTransactionChange('sale')}
                        className={cn(
                            "px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all flex items-center gap-0.5 sm:gap-1",
                            filters.transactionType === 'sale'
                                ? "bg-primary text-white"
                                : "text-zinc-400 hover:text-white"
                        )}
                    >
                        <Home className="w-3 h-3" />
                        <span className="hidden sm:inline">매매</span>
                    </button>
                    <button
                        onClick={() => handleTransactionChange('rent')}
                        className={cn(
                            "px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all flex items-center gap-0.5 sm:gap-1",
                            filters.transactionType === 'rent'
                                ? "bg-primary text-white"
                                : "text-zinc-400 hover:text-white"
                        )}
                    >
                        <Key className="w-3 h-3" />
                        <span className="hidden sm:inline">전월세</span>
                    </button>
                </div>

                {/* 가격 프리셋 - 모바일: 드롭다운 / 데스크탑: 버튼 */}
                {/* 모바일 드롭다운 */}
                <select
                    value={`${filters.priceRange.min}-${filters.priceRange.max}`}
                    onChange={(e) => {
                        const [min, max] = e.target.value.split('-').map(Number);
                        handlePricePreset(min, max);
                    }}
                    className="sm:hidden px-2 py-1 text-[11px] font-medium rounded-lg bg-zinc-800 text-zinc-300 border-none outline-none cursor-pointer flex-shrink-0"
                >
                    {PRICE_PRESETS.map((preset) => (
                        <option key={preset.label} value={`${preset.min}-${preset.max}`}>
                            {preset.label}
                        </option>
                    ))}
                </select>

                {/* 데스크탑 버튼 */}
                <div className="hidden sm:flex bg-zinc-800 rounded-lg p-0.5 flex-shrink-0">
                    {PRICE_PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => handlePricePreset(preset.min, preset.max)}
                            className={cn(
                                "px-2 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                                filters.priceRange.min === preset.min && filters.priceRange.max === preset.max
                                    ? "bg-primary text-white"
                                    : "text-zinc-400 hover:text-white"
                            )}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                {/* 연식 필터 */}
                <select
                    value={filters.yearBuilt}
                    onChange={(e) => handleYearBuiltChange(e.target.value as YearBuiltFilter)}
                    className={cn(
                        "px-2 py-1 text-xs font-medium rounded-lg bg-zinc-800 border-none outline-none cursor-pointer flex-shrink-0",
                        filters.yearBuilt !== 'all' ? "text-primary" : "text-zinc-400"
                    )}
                >
                    <option value="all">연식</option>
                    {YEAR_BUILT_OPTIONS.slice(1).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                {/* 즐겨찾기 */}
                <button
                    onClick={handleFavoritesToggle}
                    className={cn(
                        "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-all flex-shrink-0",
                        filters.favoritesOnly
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-zinc-800 text-zinc-400 hover:text-white"
                    )}
                >
                    <Star className={cn("w-3 h-3", filters.favoritesOnly && "fill-current")} />
                    {favoritesCount > 0 && <span>{favoritesCount}</span>}
                </button>

                {/* 초기화 */}
                {hasActiveFilters && (
                    <button
                        onClick={resetFilters}
                        className="flex items-center px-1.5 py-1 text-xs text-zinc-500 hover:text-white transition-colors flex-shrink-0"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
    );
}
