'use client';

import { useState, useEffect, useCallback } from 'react';

const FAVORITES_KEY = 'apt-favorites';

export function useFavorites() {
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [isLoaded, setIsLoaded] = useState(false);

    // LocalStorage에서 즐겨찾기 로드
    useEffect(() => {
        try {
            const stored = localStorage.getItem(FAVORITES_KEY);
            if (stored) {
                setFavorites(new Set(JSON.parse(stored)));
            }
        } catch (e) {
            console.error('Failed to load favorites:', e);
        }
        setIsLoaded(true);
    }, []);

    // 즐겨찾기 저장
    const saveFavorites = useCallback((newFavorites: Set<string>) => {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify([...newFavorites]));
        } catch (e) {
            console.error('Failed to save favorites:', e);
        }
    }, []);

    const addFavorite = useCallback((kaptCode: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            next.add(kaptCode);
            saveFavorites(next);
            return next;
        });
    }, [saveFavorites]);

    const removeFavorite = useCallback((kaptCode: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            next.delete(kaptCode);
            saveFavorites(next);
            return next;
        });
    }, [saveFavorites]);

    const toggleFavorite = useCallback((kaptCode: string) => {
        setFavorites(prev => {
            const next = new Set(prev);
            if (next.has(kaptCode)) {
                next.delete(kaptCode);
            } else {
                next.add(kaptCode);
            }
            saveFavorites(next);
            return next;
        });
    }, [saveFavorites]);

    const isFavorite = useCallback((kaptCode: string) => {
        return favorites.has(kaptCode);
    }, [favorites]);

    return {
        favorites,
        isLoaded,
        count: favorites.size,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        isFavorite,
    };
}
