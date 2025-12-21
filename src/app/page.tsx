"use client";
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { TrendChart } from "@/components/dashboard/trend-chart"
import PopularComplexes from "@/components/dashboard/popular-complexes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Building, AlertCircle, MapPin, BarChart3, Building2, Loader2 } from "lucide-react"
import axios from "axios"
import { format } from "date-fns"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DetailDialog } from "@/components/dashboard/detail-dialog"
import dynamic from "next/dynamic"

// 지도 컴포넌트는 클라이언트에서만 로드 (SSR 비활성화)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-muted/30 rounded-lg">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">지도 로딩 중...</p>
      </div>
    </div>
  )
});

export default function Home() {
  const searchParams = useSearchParams();
  const viewMode = searchParams.get('view') || 'list';

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
  const [statsLoading, setStatsLoading] = useState(true);

  // Dialog State with Pagination
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    title: string;
    type: 'ranking' | 'deals';
    data: any[];
    loading: boolean;
    page: number;
    hasMore: boolean;
    currentParams: any; // Store params for loadMore
  }>({
    open: false,
    title: "",
    type: 'ranking',
    data: [],
    loading: false,
    page: 0,
    hasMore: true,
    currentParams: {}
  });

  // Fetch Sido Options
  useEffect(() => {
    axios.get('/api/regions/provinces')
      .then(res => setSidoOptions(res.data))
      .catch(console.error);
  }, []);

  // Fetch Stats (KPIs)
  useEffect(() => {
    setStatsLoading(true);
    const params: Record<string, string> = {};
    if (globalSido && globalSido !== "ALL") {
      params.sido = globalSido;
    }
    axios.get('/api/stats', { params })
      .then(res => {
        setStats(res.data);
      })
      .finally(() => {
        setStatsLoading(false);
      });
  }, [globalSido]);

  // Helper to fetch details (deals)
  const fetchDeals = async (params: any, page: number) => {
    const limit = 20; // Load 20 at a time for smooth infinite scroll
    const offset = page * limit;
    const res = await axios.get('/api/deals', {
      params: { ...params, limit, offset }
    });
    return res.data;
  };

  // Load More Handler (Infinite Scroll)
  const handleLoadMore = async () => {
    if (dialogState.loading || !dialogState.hasMore) return;

    // Prevent double fetch if strict mode triggers twice
    // For simplicity, just check loading.

    // We don't set loading=true for "load more" to avoid full spinner replacement?
    // But DetailDialog shows spinner at bottom if loading is true.
    // Let's set loading true but keep data.

    // Actually, distinct 'fetchingMore' state might be better but let's reuse loading with care.
    // If we set loading=true, the list might be hidden in some implementations? 
    // In DetailDialog, valid data is shown even if loading.

    // However, to avoid flickering, let's proceed.

    try {
      const nextPage = dialogState.page + 1;

      let newData = [];
      if (dialogState.type === 'deals') {
        newData = await fetchDeals(dialogState.currentParams, nextPage);
      } else {
        // Ranking probably no pagination requested or API doesn't support it yet
        return;
      }

      setDialogState(prev => ({
        ...prev,
        data: [...prev.data, ...newData],
        page: nextPage,
        hasMore: newData.length > 0, // If we got data, maybe more exists. If empty, stop.
        // If length < limit, also stop?
        // newData.length === 20 ? true : false
      }));

    } catch (error) {
      console.error("Failed to load more data", error);
    }
  };

  // Handle Card Click
  const handleCardClick = async (type: 'topRegion' | 'monthly' | 'daily' | 'cancelled') => {
    // Reset State
    setDialogState(prev => ({
      ...prev,
      open: true,
      loading: true,
      data: [],
      page: 0,
      hasMore: true,
      currentParams: {}
    }));

    try {
      let data = [];
      let params: any = {};
      let dialogType: 'ranking' | 'deals' = 'deals';
      let title = "";

      if (type === 'topRegion') {
        title = "최고 거래량 지역";
        dialogType = 'ranking';
        // For Ranking, we currently fetch all at once or restricted top 100.
        // If sorting filter applies, pass it.
        const rankParams: any = {};
        if (globalSido && globalSido !== "ALL") rankParams.sido = globalSido;
        const res = await axios.get('/api/rank/regions', { params: rankParams });
        data = res.data;
      } else {
        // Deals types
        dialogType = 'deals';
        params = { limit: 20 }; // Initial limit
        if (globalSido && globalSido !== "ALL") params.sido = globalSido;

        if (type === 'monthly') {
          title = "월간 거래 내역 (최근 30일)";
          const today = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(today.getDate() - 30);
          params.startDate = thirtyDaysAgo.toISOString().split('T')[0];
          params.endDate = today.toISOString().split('T')[0];
          params.excludeCancelled = true; // Exclude cancelled

        } else if (type === 'daily') {
          const dateLabel = stats.latestDate ? format(new Date(stats.latestDate), 'MM.dd') : '오늘';
          title = `일일 거래 내역 (${dateLabel})`;
          const targetDate = stats.latestDate ? stats.latestDate.split('T')[0] : new Date().toISOString().split('T')[0];
          params.startDate = targetDate;
          params.endDate = targetDate;
          params.excludeCancelled = true; // Exclude cancelled

        } else if (type === 'cancelled') {
          title = "최근 거래 취소 내역 (30일)";
          const today = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(today.getDate() - 30);
          params.startDate = thirtyDaysAgo.toISOString().split('T')[0];
          params.endDate = today.toISOString().split('T')[0];
          params.onlyCancelled = true;
        }

        // Initial Fetch
        // We use offset=0 (default)
        const res = await axios.get('/api/deals', { params });
        data = res.data;
      }

      setDialogState(prev => ({
        ...prev,
        title,
        type: dialogType,
        data,
        loading: false,
        currentParams: params,
        page: 0,
        hasMore: data.length >= 20 // If retrieved full batch, assume more
      }));

    } catch (error) {
      console.error("Failed to fetch detail data", error);
      setDialogState(prev => ({ ...prev, loading: false }));
    }
  };


  // 시장정보 컴포넌트 (모바일/데스크톱 공용)
  const MarketInfoCards = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? "space-y-3" : "grid gap-4 md:grid-cols-2 lg:grid-cols-4"}>
      {/* Card 1: 최고 거래 지역 */}
      <Card
        className={`${mobile ? "border-0 shadow-none bg-muted/30" : ""} cursor-pointer hover:bg-accent/50 transition-colors`}
        onClick={() => handleCardClick('topRegion')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {globalSido === 'ALL' ? '최고 거래량 지역' : '최고 거래량 자치구'}
          </CardTitle>
          {statsLoading ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> : <MapPin className="h-4 w-4 text-primary" />}
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2">
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-xl font-bold truncate text-primary">{stats.topRegion.region || '데이터 없음'}</div>
              <p className="text-xs text-muted-foreground">
                {stats.topRegion.count.toLocaleString()}건 거래 (30일)
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card 2: 30일 거래량 */}
      <Card
        className={`${mobile ? "border-0 shadow-none bg-muted/30" : ""} cursor-pointer hover:bg-accent/50 transition-colors`}
        onClick={() => handleCardClick('monthly')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            월간 거래량
          </CardTitle>
          {statsLoading ? <Loader2 className="h-4 w-4 text-green-500 animate-spin" /> : <TrendingUp className="h-4 w-4 text-green-500" />}
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2">
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold">{stats.monthlyVolume.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
              <p className="text-xs text-muted-foreground">
                최근 30일 기준
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card 3: 일일 거래량 */}
      <Card
        className={`${mobile ? "border-0 shadow-none bg-muted/30" : ""} cursor-pointer hover:bg-accent/50 transition-colors`}
        onClick={() => handleCardClick('daily')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            일일 거래량
          </CardTitle>
          {statsLoading ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> : <Building className="h-4 w-4 text-blue-500" />}
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2">
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold">{stats.todayVolume.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
              <p className="text-xs text-muted-foreground">
                {stats.latestDate ? `${format(new Date(stats.latestDate), 'MM.dd')} 기준` : '최신 데이터'}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Card 4: 취소 건수 */}
      <Card
        className={`${mobile ? "border-0 shadow-none bg-muted/30" : ""} cursor-pointer hover:bg-accent/50 transition-colors`}
        onClick={() => handleCardClick('cancelled')}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            거래 취소
          </CardTitle>
          {statsLoading ? <Loader2 className="h-4 w-4 text-orange-500 animate-spin" /> : <AlertCircle className="h-4 w-4 text-orange-500" />}
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2">
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold text-orange-500">{stats.cancelledCount.toLocaleString()}<span className="text-base font-normal text-muted-foreground">건</span></div>
              <p className="text-xs text-muted-foreground">
                최근 30일 기준
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // 지도 모드일 때
  if (viewMode === 'map') {
    return (
      <div className="h-full w-full">
        <MapView className="h-full w-full" />
      </div>
    );
  }

  // 리스트 모드 (기존 대시보드)
  return (
    <div className="flex-1 space-y-4 p-3 sm:p-4 md:p-8 pt-4 sm:pt-6">
      {/* Detail Dialog */}
      <DetailDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
        title={dialogState.title}
        type={dialogState.type}
        data={dialogState.data}
        loading={dialogState.loading}
        onLoadMore={handleLoadMore}
        hasMore={dialogState.hasMore}
      />

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
