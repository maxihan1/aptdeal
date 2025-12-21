'use client';

import { List, Map } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'list' | 'map';

interface ViewModeToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    className?: string;
}

export default function ViewModeToggle({ mode, onChange, className }: ViewModeToggleProps) {
    return (
        <div className={cn(
            "flex items-center bg-muted rounded-lg p-1 gap-1",
            className
        )}>
            <button
                onClick={() => onChange('list')}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === 'list'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                title="리스트 보기"
            >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">리스트</span>
            </button>
            <button
                onClick={() => onChange('map')}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === 'map'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
                title="지도 보기"
            >
                <Map className="w-4 h-4" />
                <span className="hidden sm:inline">지도</span>
            </button>
        </div>
    );
}
