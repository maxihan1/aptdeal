'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapContainer } from '@/components/map';
import { ApartmentMarker } from '@/components/KakaoMap';
import { Loader2 } from 'lucide-react';

interface MapViewProps {
    className?: string;
}

interface MapBounds {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
}

// 지역 마커 타입
export interface RegionMarker {
    id: string;
    type: 'sido' | 'sigungu' | 'dong';
    name: string;
    parentName: string | null;
    lat: number;
    lng: number;
    avgPrice: number;
    dealCount: number;
    apartmentCount: number;
}

// 줌 레벨에 따른 데이터 타입 결정
function getDataTypeByZoom(zoomLevel: number): 'sido' | 'sigungu' | 'dong' | 'apartment' {
    if (zoomLevel >= 11) return 'sido';      // 줌 11-14: 시도
    if (zoomLevel >= 8) return 'sigungu';    // 줌 8-10: 시군구
    if (zoomLevel >= 5) return 'dong';       // 줌 5-7: 읍면동
    return 'apartment';                       // 줌 1-4: 개별 아파트
}

export default function MapView({ className }: MapViewProps) {
    const searchParams = useSearchParams();
    const [apartments, setApartments] = useState<ApartmentMarker[]>([]);
    const [regions, setRegions] = useState<RegionMarker[]>([]);
    const [dataType, setDataType] = useState<'sido' | 'sigungu' | 'dong' | 'apartment'>('apartment');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isInitialLoad = useRef(true);
    const currentZoomRef = useRef<number>(7); // 기본 줌 레벨

    // 선택된 지역 필터
    const selectedRegion = searchParams.get('region');
    const selectedDong = searchParams.get('dong');

    // 지역 데이터 로드
    const loadRegions = useCallback(async (type: 'sido' | 'sigungu' | 'dong', bounds?: MapBounds) => {
        if (isInitialLoad.current) {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set('type', type);

            if (bounds) {
                params.set('sw_lat', bounds.sw.lat.toString());
                params.set('sw_lng', bounds.sw.lng.toString());
                params.set('ne_lat', bounds.ne.lat.toString());
                params.set('ne_lng', bounds.ne.lng.toString());
            }

            const response = await fetch(`/api/map/regions?${params}`);
            if (!response.ok) throw new Error('API 요청 실패');

            const data = await response.json();

            // 중복 제거
            const uniqueData = data.filter((item: RegionMarker, index: number, self: RegionMarker[]) =>
                index === self.findIndex(t => t.id === item.id)
            );

            setRegions(uniqueData);
            setApartments([]); // 지역 모드에서는 아파트 숨김
            isInitialLoad.current = false;
        } catch (err) {
            console.error('Failed to load regions:', err);
            setError('지역 데이터를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 아파트 데이터 로드
    const loadApartments = useCallback(async (bounds?: MapBounds) => {
        if (isInitialLoad.current) {
            setIsLoading(true);
        }
        setError(null);

        try {
            const params = new URLSearchParams();
            if (selectedRegion) params.set('region', selectedRegion);
            if (selectedDong) params.set('dong', selectedDong);

            if (bounds) {
                params.set('sw_lat', bounds.sw.lat.toString());
                params.set('sw_lng', bounds.sw.lng.toString());
                params.set('ne_lat', bounds.ne.lat.toString());
                params.set('ne_lng', bounds.ne.lng.toString());
            }

            // 모바일에서 성능 최적화: 마커 수 제한
            const isMobile = typeof window !== 'undefined' && /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
            params.set('limit', isMobile ? '100' : '500');

            const response = await fetch(`/api/apartments/map?${params}`);

            if (!response.ok) {
                throw new Error('API 요청 실패');
            }

            const data = await response.json();

            const validData = data.filter((apt: ApartmentMarker) =>
                apt.lat && apt.lng && !isNaN(apt.lat) && !isNaN(apt.lng)
            );

            setApartments(validData);
            setRegions([]); // 아파트 모드에서는 지역 숨김
            isInitialLoad.current = false;
        } catch (err) {
            console.error('Failed to load apartments:', err);
            setError('아파트 데이터를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedRegion, selectedDong]);

    // 데이터 로드 (줌 레벨에 따라)
    const loadData = useCallback(async (zoomLevel: number, bounds?: MapBounds) => {
        const newDataType = getDataTypeByZoom(zoomLevel);
        setDataType(newDataType);

        if (newDataType === 'apartment') {
            await loadApartments(bounds);
        } else {
            await loadRegions(newDataType, bounds);
        }
    }, [loadApartments, loadRegions]);

    // 초기 로드
    useEffect(() => {
        loadData(currentZoomRef.current);
    }, [loadData]);

    // 지도 바운드 변경 시 데이터 재로드 (debounced)
    const boundsTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const handleBoundsChange = useCallback((bounds: MapBounds & { zoom?: number }) => {
        if (boundsTimeoutRef.current) {
            clearTimeout(boundsTimeoutRef.current);
        }

        const zoomLevel = bounds.zoom ?? currentZoomRef.current;
        currentZoomRef.current = zoomLevel;

        boundsTimeoutRef.current = setTimeout(() => {
            loadData(zoomLevel, bounds);
        }, 500);
    }, [loadData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-muted/30 rounded-lg">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">지도 데이터를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full bg-muted/30 rounded-lg">
                <div className="flex flex-col items-center gap-3 text-center p-4">
                    <p className="text-sm text-destructive">{error}</p>
                    <button
                        onClick={() => loadData(currentZoomRef.current)}
                        className="text-sm text-primary hover:underline"
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <MapContainer
                apartments={apartments}
                regions={regions}
                dataType={dataType}
                className="w-full h-full"
                onBoundsChange={handleBoundsChange}
            />
        </div>
    );
}
