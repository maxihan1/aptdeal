"use client";
import { Suspense, useEffect, useState } from "react"
import { TrendChart } from "@/components/dashboard/trend-chart"
import PopularComplexes from "@/components/dashboard/popular-complexes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Building, AlertCircle, MapPin } from "lucide-react"
import axios from "axios"
import { format } from "date-fns"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function Home() {
  const [globalSido, setGlobalSido] = useState<string>("ALL");
  const [sidoOptions, setSidoOptions] = useState<{ code: string, name: string }[]>([]);

  const [stats, setStats] = useState({
    topRegion: { region: '-', count: 0 },
    monthlyVolume: 0,
    todayVolume: 0,
    latestDate: null as string | null,
    cancelledCount: 0
  });

  // Fetch Sido Options
  useEffect(() => {
    axios.get('/api/regions/provinces')
      .then(res => setSidoOptions(res.data))
      .catch(console.error);
  }, []);

  // Fetch Stats (KPIs)
  useEffect(() => {
    const params: Record<string, string> = {};
    if (globalSido && globalSido !== "ALL") {
      params.sido = globalSido;
    }
    axios.get('/api/stats', { params }).then(res => {
      setStats(res.data);
    });
  }, [globalSido]);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
        <div className="flex items-center space-x-2">
          <Select value={globalSido} onValueChange={setGlobalSido}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="지역 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전국</SelectItem>
              {sidoOptions.map(opt => (
                <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: 최고 거래 지역 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {globalSido === 'ALL' ? '최고 거래 지역 (30일)' : '최고 거래 자치구 (30일)'}
            </CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">{stats.topRegion.region}</div>
            <p className="text-xs text-muted-foreground">
              {stats.topRegion.count}건 거래
            </p>
          </CardContent>
        </Card>

        {/* Card 2: 30일 거래량 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              월간 거래량 (30일)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.monthlyVolume.toLocaleString()}건</div>
            <p className="text-xs text-muted-foreground">
              최근 30일 기준
            </p>
          </CardContent>
        </Card>

        {/* Card 3: 오늘의 거래 -> 최근 일자 거래량 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              일일 거래량
            </CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayVolume.toLocaleString()}건</div>
            <p className="text-xs text-muted-foreground">
              {stats.latestDate ? `${format(new Date(stats.latestDate), 'yyyy-MM-dd')} 기준` : '오늘 등록된 거래'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: 취소 건수 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              거래 취소
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cancelledCount}건</div>
            <p className="text-xs text-muted-foreground">
              최근 30일 기준
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>시장 가격 추이 (30일)</CardTitle>
            <CardDescription>
              최근 30일간의 아파트 실거래가 평균입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <TrendChart globalSido={globalSido} />
          </CardContent>
        </Card>
        <Card className="col-span-3">
          {/* Header, Title, Description moved inside PopularComplexes or removed to avoid dup logic if PopularComplexes has its own header */}
          {/* Keeping Card container for consistent layout, but maybe PopularComplexes handles header better? */}
          {/* Let's render PopularComplexes content directly inside here. */}
          <CardHeader>
            <CardTitle>인기 단지 (30일)</CardTitle>
            <CardDescription>
              최근 30일간 거래가 가장 활발한 단지입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PopularComplexes globalSido={globalSido} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
