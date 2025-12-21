'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface KakaoMapContextType {
    isLoaded: boolean;
    error: string | null;
}

const KakaoMapContext = createContext<KakaoMapContextType>({
    isLoaded: false,
    error: null,
});

export const useKakaoMap = () => useContext(KakaoMapContext);

interface KakaoMapProviderProps {
    children: ReactNode;
}

export function KakaoMapProvider({ children }: KakaoMapProviderProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 이미 로드되어 있으면 스킵
        if (window.kakao?.maps) {
            setIsLoaded(true);
            return;
        }

        const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '7f8cd69cf60e1a67aca32539cac8bd86';

        if (!KAKAO_JS_KEY) {
            setError('Kakao JavaScript Key is not configured');
            return;
        }

        // 이미 스크립트가 로드 중인지 확인
        const existingScript = document.querySelector('script[src*="dapi.kakao.com"]');
        if (existingScript) {
            // 스크립트가 이미 있으면 로드 완료 대기
            const checkLoaded = setInterval(() => {
                if (window.kakao?.maps) {
                    window.kakao.maps.load(() => {
                        setIsLoaded(true);
                        clearInterval(checkLoaded);
                    });
                }
            }, 100);
            return () => clearInterval(checkLoaded);
        }

        // Kakao Maps SDK 스크립트 로드
        const script = document.createElement('script');
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services,clusterer&autoload=false`;
        script.async = true;

        script.onload = () => {
            // autoload=false이므로 수동으로 로드
            window.kakao.maps.load(() => {
                setIsLoaded(true);
            });
        };

        script.onerror = () => {
            setError('Failed to load Kakao Maps SDK');
        };

        document.head.appendChild(script);

        return () => {
            // Cleanup is not needed as we want to keep the script loaded
        };
    }, []);

    return (
        <KakaoMapContext.Provider value={{ isLoaded, error }}>
            {children}
        </KakaoMapContext.Provider>
    );
}
