/* eslint-disable @typescript-eslint/no-explicit-any */
// Kakao Maps SDK Type Definitions

declare global {
    interface Window {
        kakao: typeof kakao;
    }
}

declare namespace kakao {
    namespace maps {
        // LatLng class
        class LatLng {
            constructor(lat: number, lng: number);
            getLat(): number;
            getLng(): number;
            equals(latlng: LatLng): boolean;
            toString(): string;
        }

        // LatLngBounds class
        class LatLngBounds {
            constructor(sw?: LatLng, ne?: LatLng);
            extend(latlng: LatLng): void;
            contain(latlng: LatLng): boolean;
            isEmpty(): boolean;
            getSouthWest(): LatLng;
            getNorthEast(): LatLng;
            toString(): string;
        }

        // Map class
        interface MapOptions {
            center: LatLng;
            level?: number;
            mapTypeId?: MapTypeId;
            draggable?: boolean;
            scrollwheel?: boolean;
            disableDoubleClick?: boolean;
            disableDoubleClickZoom?: boolean;
            projectionId?: string;
            tileAnimation?: boolean;
            keyboardShortcuts?: boolean | object;
        }

        class Map {
            constructor(container: HTMLElement, options: MapOptions);
            setCenter(latlng: LatLng): void;
            getCenter(): LatLng;
            setLevel(level: number, options?: { anchor?: LatLng; animate?: boolean | { duration: number } }): void;
            getLevel(): number;
            setMapTypeId(mapTypeId: MapTypeId): void;
            getMapTypeId(): MapTypeId;
            setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
            getBounds(): LatLngBounds;
            setMinLevel(minLevel: number): void;
            setMaxLevel(maxLevel: number): void;
            panBy(dx: number, dy: number): void;
            panTo(latlng: LatLng): void;
            addControl(control: MapTypeControl | ZoomControl, position: ControlPosition): void;
            removeControl(control: MapTypeControl | ZoomControl): void;
            setDraggable(draggable: boolean): void;
            getDraggable(): boolean;
            setZoomable(zoomable: boolean): void;
            getZoomable(): boolean;
            relayout(): void;
            addOverlayMapTypeId(mapTypeId: MapTypeId): void;
            removeOverlayMapTypeId(mapTypeId: MapTypeId): void;
            setKeyboardShortcuts(active: boolean): void;
            getKeyboardShortcuts(): boolean;
            setCopyrightPosition(position: CopyrightPosition, reverse?: boolean): void;
            getProjectionId(): string;
            setProjectionId(projectionId: string): void;
        }

        // MapTypeId enum
        enum MapTypeId {
            ROADMAP = 1,
            SKYVIEW = 2,
            HYBRID = 3,
            OVERLAY = 4,
            ROADVIEW = 5,
            TRAFFIC = 6,
            TERRAIN = 7,
            BICYCLE = 8,
            BICYCLE_HYBRID = 9,
            USE_DISTRICT = 10
        }

        // ControlPosition enum
        enum ControlPosition {
            TOP = 0,
            TOPLEFT = 1,
            TOPRIGHT = 2,
            LEFT = 3,
            RIGHT = 4,
            BOTTOMLEFT = 5,
            BOTTOM = 6,
            BOTTOMRIGHT = 7
        }

        // CopyrightPosition enum
        enum CopyrightPosition {
            BOTTOMLEFT = 0,
            BOTTOMRIGHT = 1
        }

        // MapTypeControl class
        class MapTypeControl {
            constructor();
        }

        // ZoomControl class
        class ZoomControl {
            constructor();
        }

        // Marker class
        interface MarkerOptions {
            map?: Map;
            position: LatLng;
            image?: MarkerImage;
            title?: string;
            draggable?: boolean;
            clickable?: boolean;
            zIndex?: number;
            opacity?: number;
            altitude?: number;
            range?: number;
        }

        class Marker {
            constructor(options: MarkerOptions);
            setMap(map: Map | null): void;
            getMap(): Map | null;
            setPosition(position: LatLng): void;
            getPosition(): LatLng;
            setImage(image: MarkerImage): void;
            getImage(): MarkerImage;
            setTitle(title: string): void;
            getTitle(): string;
            setDraggable(draggable: boolean): void;
            getDraggable(): boolean;
            setClickable(clickable: boolean): void;
            getClickable(): boolean;
            setZIndex(zIndex: number): void;
            getZIndex(): number;
            setOpacity(opacity: number): void;
            getOpacity(): number;
            setAltitude(altitude: number): void;
            getAltitude(): number;
            setRange(range: number): void;
            getRange(): number;
        }

        // MarkerImage class
        interface MarkerImageOptions {
            alt?: string;
            coords?: string;
            offset?: Point;
            shape?: string;
            spriteOrigin?: Point;
            spriteSize?: Size;
        }

        class MarkerImage {
            constructor(src: string, size: Size, options?: MarkerImageOptions);
        }

        // Size class
        class Size {
            constructor(width: number, height: number);
            equals(size: Size): boolean;
            toString(): string;
        }

        // Point class
        class Point {
            constructor(x: number, y: number);
            equals(point: Point): boolean;
            toString(): string;
        }

        // CustomOverlay class
        interface CustomOverlayOptions {
            map?: Map;
            position: LatLng;
            content: string | HTMLElement;
            xAnchor?: number;
            yAnchor?: number;
            zIndex?: number;
            clickable?: boolean;
        }

        class CustomOverlay {
            constructor(options: CustomOverlayOptions);
            setMap(map: Map | null): void;
            getMap(): Map | null;
            setPosition(position: LatLng): void;
            getPosition(): LatLng;
            setContent(content: string | HTMLElement): void;
            getContent(): string | HTMLElement;
            setZIndex(zIndex: number): void;
            getZIndex(): number;
            setAltitude(altitude: number): void;
            getAltitude(): number;
            setRange(range: number): void;
            getRange(): number;
        }

        // InfoWindow class
        interface InfoWindowOptions {
            map?: Map;
            position?: LatLng;
            content?: string | HTMLElement;
            removable?: boolean;
            zIndex?: number;
            altitude?: number;
            range?: number;
            disableAutoPan?: boolean;
        }

        class InfoWindow {
            constructor(options: InfoWindowOptions);
            open(map: Map, marker?: Marker): void;
            close(): void;
            getMap(): Map | null;
            setPosition(position: LatLng): void;
            getPosition(): LatLng;
            setContent(content: string | HTMLElement): void;
            getContent(): string | HTMLElement;
            setZIndex(zIndex: number): void;
            getZIndex(): number;
            setAltitude(altitude: number): void;
            getAltitude(): number;
            setRange(range: number): void;
            getRange(): number;
        }

        // Event functions
        namespace event {
            function addListener(target: any, type: string, handler: (...args: any[]) => void): void;
            function removeListener(target: any, type: string, handler: (...args: any[]) => void): void;
            function trigger(target: any, type: string, data?: any): void;
            function preventMap(): void;
        }

        // Load function
        function load(callback: () => void): void;
    }

    // Services namespace for places, geocoder etc
    namespace maps.services {
        // Status enum
        enum Status {
            OK = 'OK',
            ZERO_RESULT = 'ZERO_RESULT',
            ERROR = 'ERROR'
        }

        // Places class
        interface PlacesSearchOptions {
            location?: kakao.maps.LatLng;
            x?: number;
            y?: number;
            radius?: number;
            bounds?: kakao.maps.LatLngBounds;
            rect?: string;
            size?: number;
            page?: number;
            sort?: SortBy;
            useMapBounds?: boolean;
            useMapCenter?: boolean;
            category_group_code?: string;
        }

        enum SortBy {
            ACCURACY = 'accuracy',
            DISTANCE = 'distance'
        }

        interface PlacesSearchResult {
            address_name: string;
            category_group_code: string;
            category_group_name: string;
            category_name: string;
            distance: string;
            id: string;
            phone: string;
            place_name: string;
            place_url: string;
            road_address_name: string;
            x: string;
            y: string;
        }

        interface Pagination {
            totalCount: number;
            hasNextPage: boolean;
            hasPrevPage: boolean;
            current: number;
            first: number;
            last: number;
            perPage: number;
            gotoFirst(): void;
            gotoLast(): void;
            gotoPage(page: number): void;
            nextPage(): void;
            prevPage(): void;
        }

        class Places {
            constructor(map?: kakao.maps.Map);
            setMap(map: kakao.maps.Map): void;
            keywordSearch(
                keyword: string,
                callback: (result: PlacesSearchResult[], status: Status, pagination: Pagination) => void,
                options?: PlacesSearchOptions
            ): void;
            categorySearch(
                code: string,
                callback: (result: PlacesSearchResult[], status: Status, pagination: Pagination) => void,
                options?: PlacesSearchOptions
            ): void;
        }

        // Geocoder class
        interface AddressResult {
            address: {
                address_name: string;
                region_1depth_name: string;
                region_2depth_name: string;
                region_3depth_name: string;
                mountain_yn: string;
                main_address_no: string;
                sub_address_no: string;
            };
            road_address?: {
                address_name: string;
                region_1depth_name: string;
                region_2depth_name: string;
                region_3depth_name: string;
                road_name: string;
                underground_yn: string;
                main_building_no: string;
                sub_building_no: string;
                building_name: string;
                zone_no: string;
            };
            x: string;
            y: string;
        }

        interface Coord2AddressResult {
            address: {
                address_name: string;
                region_1depth_name: string;
                region_2depth_name: string;
                region_3depth_name: string;
                mountain_yn: string;
                main_address_no: string;
                sub_address_no: string;
            };
            road_address?: {
                address_name: string;
                region_1depth_name: string;
                region_2depth_name: string;
                region_3depth_name: string;
                road_name: string;
                underground_yn: string;
                main_building_no: string;
                sub_building_no: string;
                building_name: string;
                zone_no: string;
            };
        }

        class Geocoder {
            constructor();
            addressSearch(
                addr: string,
                callback: (result: AddressResult[], status: Status) => void,
                options?: { page?: number; size?: number }
            ): void;
            coord2Address(
                x: number,
                y: number,
                callback: (result: Coord2AddressResult[], status: Status) => void,
                options?: { input_coord?: string }
            ): void;
            coord2RegionCode(
                x: number,
                y: number,
                callback: (result: any[], status: Status) => void,
                options?: { input_coord?: string }
            ): void;
            transCoord(
                x: number,
                y: number,
                callback: (result: any[], status: Status) => void,
                options?: { input_coord?: string; output_coord?: string }
            ): void;
        }
    }
}

export { };
