'use client';

import { GraduationCap } from 'lucide-react';
import { SchoolInfo } from './types';

interface SchoolSectionProps {
    data: SchoolInfo | null;
}

export default function SchoolSection({ data }: SchoolSectionProps) {
    if (!data) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                학군 정보가 없습니다
            </div>
        );
    }

    const schools = [
        { type: '초등학교', info: data.elementary },
        { type: '중학교', info: data.middle },
        { type: '고등학교', info: data.high },
    ].filter(s => s.info);

    if (schools.length === 0) {
        return (
            <div className="text-center text-muted-foreground text-xs py-4 bg-accent/20 rounded-lg">
                학군 정보가 없습니다
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" />
                학군 정보
            </h4>
            <div className="space-y-1.5">
                {schools.map((school, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-accent/30 rounded-lg"
                    >
                        <div>
                            <div className="text-[10px] text-muted-foreground">{school.type}</div>
                            <div className="font-medium text-sm">{school.info?.name}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {school.info?.distance}m
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
