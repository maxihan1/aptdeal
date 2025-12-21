"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchResult {
    aptName: string;       // 표시명: "읍면동 아파트명"
    aptNm: string;         // apt_deal_info 원본명 (URL에 사용)
    region: string;        // "시도 시군구 읍면동"
    sido: string;
    sigungu: string;
    dong: string;
    kaptCode?: string;     // K-apt 단지코드 (주소 기반 매핑)
    jibun?: string;        // 지번 주소
}

interface AptSearchInputProps {
    onSelect?: (result: SearchResult) => void;
    className?: string;
}

export default function AptSearchInput({ onSelect, className }: AptSearchInputProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // 디바운싱된 검색
    const handleSearch = useCallback(async (searchQuery: string) => {
        if (searchQuery.trim().length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/search/apartments?q=${encodeURIComponent(searchQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
                setIsOpen(data.length > 0);
                setSelectedIndex(-1);
            }
        } catch (error) {
            console.error("[Search Error]", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 입력 변경 핸들러 (300ms 디바운스)
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            handleSearch(value);
        }, 300);
    };

    // 결과 선택
    const handleSelect = (result: SearchResult) => {
        setQuery("");
        setIsOpen(false);
        setResults([]);

        if (onSelect) {
            onSelect(result);
        } else {
            // 기본 동작: 아파트 상세 페이지로 이동
            // apt_deal_info 기반이므로 지역검색과 동일한 파라미터 전달
            const params = new URLSearchParams({
                s: result.sido,
                g: result.sigungu,
                d: result.dong,
                r: result.region,
                t: "trade"
            });
            // kaptCode가 있으면 URL에 추가 (주소 기반 매핑)
            if (result.kaptCode) {
                params.set('k', result.kaptCode);
            }
            if (result.jibun) {
                params.set('j', result.jibun);
            }
            // aptNm 사용 (apt_deal_info 원본명)
            router.push(`/apt/${encodeURIComponent(result.aptNm)}?${params.toString()}`);
        }
    };

    // 키보드 네비게이션
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || results.length === 0) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : prev
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case "Enter":
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < results.length) {
                    handleSelect(results[selectedIndex]);
                }
                break;
            case "Escape":
                setIsOpen(false);
                setSelectedIndex(-1);
                break;
        }
    };

    // 외부 클릭 감지
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 클린업
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    return (
        <div className={cn("relative", className)}>
            {/* 검색 입력창 */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setIsOpen(true)}
                    placeholder="아파트 검색..."
                    className="pl-9 pr-9"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {/* 자동완성 드롭다운 */}
            {isOpen && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
                >
                    {results.length === 0 && !isLoading ? (
                        <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                            검색 결과가 없습니다
                        </div>
                    ) : (
                        <ul className="max-h-64 overflow-y-auto">
                            {results.map((result, index) => (
                                <li
                                    key={`${result.aptNm}-${result.dong}-${index}`}
                                    onClick={() => handleSelect(result)}
                                    className={cn(
                                        "px-4 py-2.5 cursor-pointer text-sm transition-colors",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        index === selectedIndex && "bg-accent text-accent-foreground"
                                    )}
                                >
                                    <div className="font-medium">{result.aptName}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {result.region}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
