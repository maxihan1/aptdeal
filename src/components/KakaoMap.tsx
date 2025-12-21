'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useKakaoMap } from './KakaoMapProvider';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface ApartmentMarker {
    id: string;
    name: string;
    displayName?: string;
    address: string;
    lat: number;
    lng: number;
    avgPrice: number; // 만원 단위
    priceChange?: number; // 전월 대비 변동률 (%)
    householdCount?: number;
    dong?: string;
    gu?: string;
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

interface KakaoMapProps {
    apartments: ApartmentMarker[];
    regions?: RegionMarker[];
    dataType?: 'sido' | 'sigungu' | 'dong' | 'apartment';
    className?: string;
    initialCenter?: { lat: number; lng: number };
    initialLevel?: number;
    center?: { lat: number; lng: number }; // 외부에서 제어
    level?: number; // 외부에서 제어
    onBoundsChange?: (bounds: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number }; zoom: number }) => void;
    onApartmentClick?: (apartment: ApartmentMarker) => void;
    onRegionClick?: (region: RegionMarker) => void;
    selectedApartmentId?: string;
}

// 가격을 억 단위로 포맷
function formatPrice(price: number): string {
    if (!price) return '-';
    const eok = Math.floor(price / 10000);
    const remainder = Math.round((price % 10000) / 1000) * 1000;

    if (eok > 0) {
        return remainder > 0 ? `${eok}.${Math.round(remainder / 1000)}억` : `${eok}억`;
    }
    return `${Math.round(price / 100) * 100}만`;
}

export default function KakaoMap({
    apartments,
    regions = [],
    dataType = 'apartment',
    className,
    initialCenter = { lat: 37.5665, lng: 126.9780 }, // 서울 중심
    initialLevel = 7,
    center,
    level,
    onBoundsChange,
    onApartmentClick,
    onRegionClick,
    selectedApartmentId,
}: KakaoMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapInstanceRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overlaysRef = useRef<any[]>([]);
    const { isLoaded, error } = useKakaoMap();
    const router = useRouter();
    const [isMapReady, setIsMapReady] = useState(false);

    // 지도 초기화
    useEffect(() => {

        if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

        const map = new window.kakao.maps.Map(mapRef.current, {
            center: new window.kakao.maps.LatLng(initialCenter.lat, initialCenter.lng),
            level: initialLevel,
            draggable: true, // 모바일 터치 드래그 지원
            scrollwheel: true, // 마우스 휠 줌
        });

        // 줌 컨트롤 추가
        const zoomControl = new window.kakao.maps.ZoomControl();
        map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

        mapInstanceRef.current = map;
        setIsMapReady(true);

        // Bounds 변경 이벤트
        if (onBoundsChange) {
            window.kakao.maps.event.addListener(map, 'idle', () => {
                const bounds = map.getBounds();
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                onBoundsChange({
                    sw: { lat: sw.getLat(), lng: sw.getLng() },
                    ne: { lat: ne.getLat(), lng: ne.getLng() },
                    zoom: map.getLevel(),
                });
            });
        }

        return () => {
            // Cleanup overlays
            overlaysRef.current.forEach(overlay => overlay.setMap(null));
            overlaysRef.current = [];
        };
    }, [isLoaded, initialCenter, initialLevel, onBoundsChange]);

    // 외부에서 center/level 변경 시 지도 이동 (부드러운 애니메이션)
    useEffect(() => {
        if (!mapInstanceRef.current || !isMapReady) return;

        const map = mapInstanceRef.current;

        // 부드러운 이동과 줌
        if (center && center.lat && center.lng && level !== undefined) {
            // 먼저 중심 이동, 그 다음 줌 (더 자연스러움)
            map.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));

            // 줌 레벨은 약간의 딜레이 후 적용 (애니메이션 효과)
            const currentLevel = map.getLevel();
            if (currentLevel !== level) {
                const steps = Math.abs(currentLevel - level);
                const direction = level < currentLevel ? -1 : 1;

                // 단계적으로 줌 (각 100ms마다)
                for (let i = 1; i <= steps; i++) {
                    setTimeout(() => {
                        map.setLevel(currentLevel + (direction * i), { animate: true });
                    }, i * 150);
                }
            }
        } else if (center && center.lat && center.lng) {
            map.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));
        } else if (level !== undefined) {
            map.setLevel(level, { animate: true });
        }
    }, [center, level, isMapReady]);

    // 아파트 클릭 핸들러
    const handleApartmentClick = useCallback((apartment: ApartmentMarker) => {
        if (onApartmentClick) {
            onApartmentClick(apartment);
        } else {
            // 기본 동작: 단지 상세 페이지로 이동
            const params = new URLSearchParams({
                region: apartment.gu || '',
                dong: apartment.dong || '',
                name: apartment.name,
            });
            router.push(`/?${params.toString()}`);
        }
    }, [onApartmentClick, router]);

    // 마커(오버레이) 업데이트
    useEffect(() => {
        if (!isMapReady || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // 기존 오버레이 제거
        overlaysRef.current.forEach(overlay => overlay.setMap(null));
        overlaysRef.current = [];

        // 지역 마커 (시도/시군구/읍면동)
        if (dataType !== 'apartment' && regions.length > 0) {
            regions.forEach((region) => {
                if (!region.lat || !region.lng) return;

                const content = document.createElement('div');
                content.className = `region-marker region-${region.type}`;
                content.innerHTML = `
                    <div class="region-marker-content">
                        <span class="region-marker-name">${region.name}</span>
                        <span class="region-marker-price">${formatPrice(region.avgPrice)}</span>
                        <span class="region-marker-count">${region.apartmentCount}개 단지</span>
                    </div>
                `;

                // 클릭 이벤트 추가
                content.addEventListener('click', () => {
                    if (onRegionClick) {
                        onRegionClick(region);
                    }
                });

                const overlay = new window.kakao.maps.CustomOverlay({
                    map,
                    position: new window.kakao.maps.LatLng(region.lat, region.lng),
                    content,
                    yAnchor: 0.5,
                    clickable: true,
                });

                overlaysRef.current.push(overlay);
            });
            return;
        }

        // 아파트 마커
        apartments.forEach((apt) => {
            if (!apt.lat || !apt.lng) return;

            const isSelected = apt.id === selectedApartmentId;
            const priceClass = apt.priceChange && apt.priceChange > 0 ? 'up' : apt.priceChange && apt.priceChange < 0 ? 'down' : '';
            const rentalClass = (apt as any).isRental ? 'rental' : '';

            const content = document.createElement('div');
            content.className = `apt-marker ${priceClass} ${rentalClass} ${isSelected ? 'selected' : ''}`.trim();
            content.innerHTML = `
        <div class="apt-marker-content">
          <span class="apt-marker-name">${apt.name}</span>
          <span class="apt-marker-price">${(apt as any).isRental ? '임대' : formatPrice(apt.avgPrice)}</span>
        </div>
        <div class="apt-marker-arrow"></div>
      `;

            content.addEventListener('click', () => handleApartmentClick(apt));

            const overlay = new window.kakao.maps.CustomOverlay({
                map,
                position: new window.kakao.maps.LatLng(apt.lat, apt.lng),
                content,
                yAnchor: 1.3,
                clickable: true,
            });

            overlaysRef.current.push(overlay);
        });
    }, [apartments, regions, dataType, isMapReady, selectedApartmentId, handleApartmentClick, onRegionClick]);

    // 지도 중심 이동
    const moveToCenter = useCallback((lat: number, lng: number, level?: number) => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;
        map.panTo(new window.kakao.maps.LatLng(lat, lng));
        if (level !== undefined) {
            map.setLevel(level);
        }
    }, []);

    // 모든 마커가 보이도록 bounds 조정
    const fitBounds = useCallback(() => {
        if (!mapInstanceRef.current || apartments.length === 0) return;
        const map = mapInstanceRef.current;
        const bounds = new window.kakao.maps.LatLngBounds();

        apartments.forEach((apt) => {
            if (apt.lat && apt.lng) {
                bounds.extend(new window.kakao.maps.LatLng(apt.lat, apt.lng));
            }
        });

        map.setBounds(bounds, 50, 50, 50, 50);
    }, [apartments]);

    if (error) {
        return (
            <div className={cn("flex items-center justify-center bg-muted rounded-lg", className)}>
                <div className="text-center text-muted-foreground p-8">
                    <p className="text-lg font-medium mb-2">지도를 불러올 수 없습니다</p>
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className={cn("flex items-center justify-center bg-muted rounded-lg", className)}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground">지도 로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("relative", className)}>
            <div ref={mapRef} className="w-full h-full rounded-lg" />

            {/* 지도 컨트롤 */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
                <button
                    onClick={fitBounds}
                    className="bg-background/90 backdrop-blur-sm border shadow-lg rounded-lg p-2 hover:bg-accent transition-colors"
                    title="전체 보기"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                </button>
            </div>

            {/* 아파트 수 표시 */}
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border shadow-lg rounded-lg px-3 py-2 z-10">
                <span className="text-sm font-medium">
                    {apartments.length}개 단지
                </span>
            </div>
        </div>
    );
}

// CSS를 위한 스타일 (globals.css에 추가 필요)
export const kakaoMapStyles = `
.apt-marker {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.apt-marker:hover {
  transform: scale(1.08);
  z-index: 100 !important;
}

.apt-marker.selected {
  transform: scale(1.1);
  z-index: 100 !important;
}

.apt-marker-content {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(260, 60%, 45%) 100%);
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  text-align: center;
  min-width: 60px;
}

.apt-marker.up .apt-marker-content {
  background: linear-gradient(135deg, #e85d6c 0%, #c77dbb 100%);
}

.apt-marker.down .apt-marker-content {
  background: linear-gradient(135deg, #5a9fd4 0%, #7eb8d8 100%);
}

.apt-marker.selected .apt-marker-content {
  box-shadow: 0 0 0 3px white, 0 4px 16px rgba(0, 0, 0, 0.4);
}

.apt-marker.rental .apt-marker-content {
  background: linear-gradient(135deg, #6b7280 0%, #9ca3af 100%);
  opacity: 0.8;
}

.apt-marker.rental .apt-marker-arrow {
  border-top-color: #6b7280;
}

.apt-marker-name {
  display: block;
  font-size: 8px;
  opacity: 0.95;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 65px;
}

.apt-marker-price {
  display: block;
  font-size: 10px;
  font-weight: 700;
}

.apt-marker-arrow {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid hsl(var(--primary));
  margin: 0 auto;
}

.apt-marker.up .apt-marker-arrow {
  border-top-color: #e85d6c;
}

.apt-marker.down .apt-marker-arrow {
  border-top-color: #5a9fd4;
}
`;
