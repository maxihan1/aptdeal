'use client';

import { useState, useCallback, useEffect } from 'react';
import KakaoMap, { ApartmentMarker, RegionMarker } from '../KakaoMap';
import MapSidebar from './MapSidebar';
import RegionSidebar from './RegionSidebar';
import { cn } from '@/lib/utils';
import { Search, Loader2, X } from 'lucide-react';

interface MapBounds {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
    zoom?: number;
}

// RegionMarker를 다시 export
export type { RegionMarker };

// 검색 결과 타입
interface SearchResult {
    aptName: string;
    aptNm: string;
    region: string;
    sido: string;
    sigungu: string;
    dong: string;
    kaptCode?: string;
    lat?: number;
    lng?: number;
}

interface MapContainerProps {
    apartments: ApartmentMarker[];
    regions?: RegionMarker[];
    dataType?: 'sido' | 'sigungu' | 'dong' | 'apartment';
    className?: string;
    onApartmentSelect?: (apartment: ApartmentMarker | null) => void;
    onBoundsChange?: (bounds: MapBounds) => void;
    onRegionSelect?: (region: RegionMarker | null) => void;
}

export default function MapContainer({
    apartments,
    regions = [],
    dataType = 'apartment',
    className,
    onApartmentSelect,
    onBoundsChange,
    onRegionSelect,
}: MapContainerProps) {
    // 모바일 감지
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768 || /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent));
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 아파트 사이드바 상태
    const [selectedApartment, setSelectedApartment] = useState<ApartmentMarker | null>(null);
    const [isApartmentSidebarOpen, setIsApartmentSidebarOpen] = useState(false);

    // 지역 사이드바 상태
    const [selectedRegion, setSelectedRegion] = useState<RegionMarker | null>(null);
    const [isRegionSidebarOpen, setIsRegionSidebarOpen] = useState(false);

    // 지도 중심/줌 제어
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>();
    const [mapLevel, setMapLevel] = useState<number | undefined>();

    // 현재 지도 영역 (사이드바 업데이트용)
    const [currentBounds, setCurrentBounds] = useState<{
        sw: { lat: number; lng: number };
        ne: { lat: number; lng: number };
    } | undefined>();

    // 검색 상태
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // 검색 함수
    const handleSearch = useCallback(async (query: string) => {
        if (query.trim().length < 2) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setIsSearching(true);
        try {
            const res = await fetch(`/api/search/apartments?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.slice(0, 8));
                setShowSearchResults(data.length > 0);
            }
        } catch (e) {
            console.error('Search error:', e);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // 검색 결과 선택 - 좌표로 이동
    const handleSearchSelect = useCallback(async (result: SearchResult) => {
        setShowSearchResults(false);
        setSearchQuery('');
        setSearchResults([]);

        let lat = result.lat;
        let lng = result.lng;

        // 검색 결과에 좌표가 없으면 API로 조회 시도
        if (!lat || !lng) {
            try {
                const params = new URLSearchParams();
                if (result.kaptCode) {
                    params.set('kaptCode', result.kaptCode);
                }
                params.set('aptName', result.aptNm);
                params.set('dong', result.dong);

                const coordRes = await fetch(`/api/apartments/coordinates?${params}`);
                if (coordRes.ok) {
                    const coordData = await coordRes.json();
                    lat = coordData.lat;
                    lng = coordData.lng;
                }
            } catch (e) {
                console.error('Failed to get coordinates:', e);
            }
        }

        // 좌표가 있으면 이동
        if (lat && lng) {
            setMapCenter({ lat, lng });
            setMapLevel(3);

            const marker: ApartmentMarker = {
                id: result.kaptCode || result.aptNm,
                name: result.aptNm,  // DB 조회용 원본 이름 사용
                displayName: result.aptName, // 사용자 표시용 이름 (수진마을써니벨리 등)
                address: result.region,
                lat,
                lng,
                avgPrice: 0,
                dong: result.dong,
                gu: result.sigungu,
            };
            setSelectedApartment(marker);
            setIsApartmentSidebarOpen(true);
        } else {
            console.log('No coordinates available for this apartment');
        }
    }, []); // Removed isMobile dependency as it's no longer used here

    // 아파트 클릭 핸들러
    const handleApartmentClick = useCallback((apartment: ApartmentMarker) => {
        setSelectedApartment(apartment);
        setIsApartmentSidebarOpen(true);
        setIsRegionSidebarOpen(false);
        onApartmentSelect?.(apartment);
    }, [onApartmentSelect, isMobile]);

    // 지역 클릭 핸들러
    const handleRegionClick = useCallback((region: RegionMarker) => {
        setSelectedRegion(region);
        setIsRegionSidebarOpen(true);
        setIsApartmentSidebarOpen(false);
        onRegionSelect?.(region);

        const zoomLevels = { sido: 9, sigungu: 6, dong: 3 };
        if (region.lat && region.lng) {
            setMapCenter({ lat: region.lat, lng: region.lng });
            setMapLevel(zoomLevels[region.type]);
        }
    }, [onRegionSelect, isMobile]);

    // 아파트 사이드바 닫기
    const handleApartmentSidebarClose = useCallback(() => {
        setIsApartmentSidebarOpen(false);
        setTimeout(() => {
            setSelectedApartment(null);
            onApartmentSelect?.(null);
        }, 300);
    }, [onApartmentSelect]);

    // 지역 사이드바 닫기
    const handleRegionSidebarClose = useCallback(() => {
        setIsRegionSidebarOpen(false);
        setTimeout(() => {
            setSelectedRegion(null);
            onRegionSelect?.(null);
        }, 300);
    }, [onRegionSelect]);

    // 하위 지역 클릭
    const handleChildRegionClick = useCallback((child: { lat?: number; lng?: number; name: string }, childType: string) => {
        if (child.lat && child.lng) {
            const zoomLevel = childType === 'sigungu' ? 6 : childType === 'dong' ? 3 : 1;
            setMapCenter({ lat: child.lat, lng: child.lng });
            setMapLevel(zoomLevel);
        }

        if (selectedRegion) {
            const newRegion: RegionMarker = {
                id: `${childType}-${child.name}`,
                type: childType as 'sido' | 'sigungu' | 'dong',
                name: child.name,
                parentName: selectedRegion.type === 'sido' ? selectedRegion.name :
                    `${selectedRegion.parentName} ${selectedRegion.name}`,
                lat: child.lat || 0,
                lng: child.lng || 0,
                avgPrice: 0,
                dealCount: 0,
                apartmentCount: 0,
            };
            setSelectedRegion(newRegion);
        }
    }, [selectedRegion]);

    // 하위 아파트 클릭
    const handleChildApartmentClick = useCallback((apt: { id?: string; name: string; address?: string }) => {
        if (apt.id) {
            const marker: ApartmentMarker = {
                id: apt.id,
                name: apt.name,
                address: apt.address || '',
                lat: 0,
                lng: 0,
                avgPrice: 0,
            };
            setSelectedApartment(marker);
            setIsApartmentSidebarOpen(true);
            setIsRegionSidebarOpen(false);
        }
    }, []); // Removed isMobile dependency as it's no longer used here

    return (
        <div
            className={cn("relative w-full h-full", className)}
            style={{ touchAction: 'manipulation' }}
        >
            {/* 플로팅 검색바 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            handleSearch(e.target.value);
                        }}
                        onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                        placeholder="아파트 검색..."
                        className="w-full pl-9 pr-9 py-2.5 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/50 dark:border-zinc-700/50 rounded-lg shadow-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {searchQuery && !isSearching && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setSearchResults([]);
                                setShowSearchResults(false);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </button>
                    )}
                </div>

                {/* 검색 결과 드롭다운 */}
                {showSearchResults && searchResults.length > 0 && (
                    <div className="mt-1 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-white/50 dark:border-zinc-700/50 rounded-lg shadow-lg overflow-hidden">
                        <ul className="max-h-64 overflow-y-auto">
                            {searchResults.map((result, index) => (
                                <li
                                    key={`${result.aptNm}-${result.dong}-${index}`}
                                    onClick={() => handleSearchSelect(result)}
                                    className="px-4 py-2.5 cursor-pointer text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <div className="font-medium">{result.aptName}</div>
                                    <div className="text-xs text-muted-foreground truncate">{result.region}</div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <MapSidebar
                apartment={selectedApartment ? {
                    id: selectedApartment.id,
                    name: selectedApartment.name,
                    address: selectedApartment.address,
                    dong: selectedApartment.dong,
                    gu: selectedApartment.gu,
                    avgPrice: selectedApartment.avgPrice,
                    householdCount: selectedApartment.householdCount,
                } : null}
                isOpen={isApartmentSidebarOpen}
                onClose={handleApartmentSidebarClose}
            />

            <RegionSidebar
                regionType={selectedRegion?.type || 'sido'}
                regionName={selectedRegion?.name || ''}
                parentName={selectedRegion?.parentName}
                isOpen={isRegionSidebarOpen}
                onClose={handleRegionSidebarClose}
                onRegionClick={handleChildRegionClick}
                onApartmentClick={handleChildApartmentClick}
            />

            {/* 지도 */}
            <KakaoMap
                apartments={apartments}
                regions={regions}
                dataType={dataType}
                className="w-full h-full"
                center={mapCenter}
                level={mapLevel}
                onApartmentClick={handleApartmentClick}
                onRegionClick={handleRegionClick}
                selectedApartmentId={selectedApartment?.id}
                onBoundsChange={(bounds) => {
                    if (bounds.sw && bounds.ne) {
                        setCurrentBounds({ sw: bounds.sw, ne: bounds.ne });
                    }
                    onBoundsChange?.(bounds);
                }}
            />
        </div>
    );
}
