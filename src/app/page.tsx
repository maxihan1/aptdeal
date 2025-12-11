"use client";
import { Suspense, useEffect, useState } from "react"
import { TrendChart } from "@/components/dashboard/trend-chart"
import PopularComplexes from "@/components/dashboard/popular-complexes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Building, AlertCircle, MapPin, BarChart3, Building2 } from "lucide-react"
import axios from "axios"
import { format } from "date-fns"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function Home() {
  const [globalSido, setGlobalSido] = useState<string>("ALL");
  const [sidoOptions, setSidoOptions] = useState<{ code: string, name: string }[]>([]);
  const [activeTab, setActiveTab] = useState("market-info");

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

  // 시장정보 컴포넌트 (모바일/데스크톱 공용)
  const MarketInfoCards = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? "space-y-3" : "grid gap-4 md:grid-cols-2 lg:grid-cols-4"}>
      {/* Card 1: 최고 거래 지역 */}
      <Card className={mobile ? "border-0 shadow-none bg-muted/30" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {globalSido === 'ALL' ? '최고 거래 지역' : '최고 거래 자치구'}
          </CardTitle>
          <MapPin className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold truncate text-primary">{stats.topRegion.region}</div>
          <p className="text-xs text-muted-foreground">
            {stats.topRegion.count.toLocaleString()}건 거래 (30일)
          </p>
        </CardContent>
      </Card>

      {/* Card 2: 30일 거래량 */}
      <Card className={mobile ? "border-0 shadow-none bg-muted/30" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            월간 거래량
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.monthlyVolume.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
          <p className="text-xs text-muted-foreground">
            최근 30일 기준
          </p>
        </CardContent>
      </Card>

      {/* Card 3: 일일 거래량 */}
      <Card className={mobile ? "border-0 shadow-none bg-muted/30" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            일일 거래량
          </CardTitle>
          <Building className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.todayVolume.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
          <p className="text-xs text-muted-foreground">
            {stats.latestDate ? `${format(new Date(stats.latestDate), 'MM.dd')} 기준` : '최신 데이터'}
          </p>
        </CardContent>
      </Card>

      {/* Card 4: 취소 건수 */}
      <Card className={mobile ? "border-0 shadow-none bg-muted/30" : ""}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            거래 취소
          </CardTitle>
          <AlertCircle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-500">{stats.cancelledCount.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
          <p className="text-xs text-muted-foreground">
            최근 30일 기준
          </p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex-1 space-y-4 p-3 sm:p-4 md:p-8 pt-4 sm:pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">대시보드</h2>
        <div className="flex items-center">
          <Select value={globalSido} onValueChange={setGlobalSido}>
            <SelectTrigger className="w-full sm:w-[180px]">
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

      {/* Mobile: Tab Navigation */}
      <div className="block lg:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-12 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger
              value="market-info"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-1.5 text-xs sm:text-sm"
            >
              <BarChart3 className="h-4 w-4" />
              <span>시장정보</span>
            </TabsTrigger>
            <TabsTrigger
              value="price-trend"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-1.5 text-xs sm:text-sm"
            >
              <TrendingUp className="h-4 w-4" />
              <span>가격추이</span>
            </TabsTrigger>
            <TabsTrigger
              value="popular"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-1.5 text-xs sm:text-sm"
            >
              <Building2 className="h-4 w-4" />
              <span>인기단지</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="market-info" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">시장 정보</CardTitle>
                <CardDescription>최근 30일 거래 현황</CardDescription>
              </CardHeader>
              <CardContent>
                <MarketInfoCards mobile={true} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="price-trend" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">시장 가격 추이</CardTitle>
                <CardDescription>최근 30일간 평균 거래가</CardDescription>
              </CardHeader>
              <CardContent className="pl-0 pr-2">
                <TrendChart globalSido={globalSido} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="popular" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">인기 단지</CardTitle>
                <CardDescription>거래가 가장 활발한 단지</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <PopularComplexes globalSido={globalSido} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: Original Layout */}
      <div className="hidden lg:block space-y-4">
        {/* KPI Cards */}
        <MarketInfoCards mobile={false} />

        <div className="grid gap-4 lg:grid-cols-7">
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
    </div>
  )
}
