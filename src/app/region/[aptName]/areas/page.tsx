"use client";
import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building, TrendingUp, ArrowLeft, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Link from 'next/link';

interface Deal {
  id: string;
  region: string;
  address: string;
  area: number;
  price: number;
  date: string;
  aptname: string;
  floor: number;
  buildyear: number;
  dealmonth: number;
  dealday: number;
  tradetype: string;
  cdealtype: string;
}

interface AreaAnalysis {
  area: number;
  totalDeals: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePerSqm: number;
  recentTrend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export default function AreaAnalysisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const aptName = decodeURIComponent(params.aptName as string);
  const selectedArea = Number(searchParams.get('area')) || 84.99;

  const [areaAnalysis, setAreaAnalysis] = useState<AreaAnalysis | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'1y' | '2y' | '3y' | 'all'>('1y');

  const loadAreaAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      // 실제 API 호출 로직 (현재는 더미 데이터)
      const mockDeals: Deal[] = [
        {
          id: '1',
          region: '강남구 개포동',
          address: '개포로 123',
          area: selectedArea,
          price: 120000,
          date: '2024-01-15',
          aptname: aptName,
          floor: 10,
          buildyear: 2019,
          dealmonth: 1,
          dealday: 15,
          tradetype: '중개거래',
          cdealtype: '',
        },
        {
          id: '2',
          region: '강남구 개포동',
          address: '개포로 123',
          area: selectedArea,
          price: 125000,
          date: '2024-01-10',
          aptname: aptName,
          floor: 15,
          buildyear: 2019,
          dealmonth: 1,
          dealday: 10,
          tradetype: '중개거래',
          cdealtype: '',
        },
        {
          id: '3',
          region: '강남구 개포동',
          address: '개포로 123',
          area: selectedArea,
          price: 118000,
          date: '2023-12-20',
          aptname: aptName,
          floor: 8,
          buildyear: 2019,
          dealmonth: 12,
          dealday: 20,
          tradetype: '중개거래',
          cdealtype: '',
        },
        {
          id: '4',
          region: '강남구 개포동',
          address: '개포로 123',
          area: selectedArea,
          price: 122000,
          date: '2023-11-15',
          aptname: aptName,
          floor: 12,
          buildyear: 2019,
          dealmonth: 11,
          dealday: 15,
          tradetype: '중개거래',
          cdealtype: '',
        },
        {
          id: '5',
          region: '강남구 개포동',
          address: '개포로 123',
          area: selectedArea,
          price: 115000,
          date: '2023-10-05',
          aptname: aptName,
          floor: 5,
          buildyear: 2019,
          dealmonth: 10,
          dealday: 5,
          tradetype: '중개거래',
          cdealtype: '',
        },
      ];

      const analysis: AreaAnalysis = {
        area: selectedArea,
        totalDeals: mockDeals.length,
        avgPrice: Math.round(mockDeals.reduce((sum, deal) => sum + deal.price, 0) / mockDeals.length),
        minPrice: Math.min(...mockDeals.map(deal => deal.price)),
        maxPrice: Math.max(...mockDeals.map(deal => deal.price)),
        pricePerSqm: Math.round(mockDeals.reduce((sum, deal) => sum + deal.price, 0) / mockDeals.length / selectedArea),
        recentTrend: 'up',
        trendPercentage: 4.2,
      };

      setDeals(mockDeals);
      setAreaAnalysis(analysis);
    } catch (error) {
      console.error('면적별 분석 로딩 중 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [aptName, selectedArea]);

  useEffect(() => {
    loadAreaAnalysis();
  }, [loadAreaAnalysis]);

  const formatPrice = (price: number) => {
    const eok = Math.floor(price / 10000);
    const chun = price % 10000;
    let result = '';
    if (eok > 0) result += `${eok}억`;
    if (chun > 0) result += `${chun.toLocaleString()}만원`;
    return result;
  };

  const chartData = deals
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(deal => ({
      date: deal.date,
      price: deal.price,
    }));

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (!areaAnalysis) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-gray-500">면적별 분석 정보를 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <Link href={`/region/${encodeURIComponent(aptName)}?${searchParams.toString()}`}>
          <Button variant="outline" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            단지 상세로
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <Building className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{aptName}</h1>
            <p className="text-muted-foreground">
              {selectedArea}㎡ 면적별 상세 분석
            </p>
          </div>
        </div>
      </div>

      {/* 분석 통계 */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{formatPrice(areaAnalysis.avgPrice)}</div>
            <p className="text-xs text-muted-foreground">평균 거래가</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{areaAnalysis.totalDeals}건</div>
            <p className="text-xs text-muted-foreground">총 거래 건수</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">{areaAnalysis.pricePerSqm.toLocaleString()}만원/㎡</div>
            <p className="text-xs text-muted-foreground">평균 단위가격</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">
              {areaAnalysis.trendPercentage > 0 ? '+' : ''}{areaAnalysis.trendPercentage}%
            </div>
            <p className="text-xs text-muted-foreground">최근 가격 변동</p>
          </CardContent>
        </Card>
      </div>

      {/* 가격 범위 */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>가격 범위</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">최고가</span>
                <span className="font-bold text-red-600">{formatPrice(areaAnalysis.maxPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">평균가</span>
                <span className="font-bold text-primary">{formatPrice(areaAnalysis.avgPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">최저가</span>
                <span className="font-bold text-green-600">{formatPrice(areaAnalysis.minPrice)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-green-500 via-blue-500 to-red-500 h-2 rounded-full"
                  style={{ width: '100%' }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>가격 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-5 h-5 ${areaAnalysis.recentTrend === 'up' ? 'text-green-600' :
                  areaAnalysis.recentTrend === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`} />
                <span className="font-medium">
                  {areaAnalysis.recentTrend === 'up' ? '상승' :
                    areaAnalysis.recentTrend === 'down' ? '하락' : '안정'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                최근 거래 기준으로 가격이 {areaAnalysis.trendPercentage > 0 ? '상승' : '하락'}하고 있습니다.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 차트 필터 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            가격 추이 차트
          </CardTitle>
          <CardDescription>
            시간 범위를 선택하여 가격 변화를 확인하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={timeRange} onValueChange={(value: '1y' | '2y' | '3y' | 'all') => setTimeRange(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1y">최근 1년</SelectItem>
                <SelectItem value="2y">최근 2년</SelectItem>
                <SelectItem value="3y">최근 3년</SelectItem>
                <SelectItem value="all">전체 기간</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 가격 추이 차트 */}
          {chartData.length > 0 && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => (value / 10000).toFixed(0) + '억'}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPrice(value), '거래가']}
                    labelFormatter={(label) => `계약일: ${new Date(label).toLocaleDateString('ko-KR')}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#2563eb' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 거래 내역 */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedArea}㎡ 거래 내역
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {deals.length}건
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {deals.map((deal) => (
              <div key={deal.id} className="border rounded-lg p-4 hover:bg-muted/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold">{deal.aptname}</h3>
                    <p className="text-sm text-gray-600">{deal.region}</p>
                  </div>
                  <span className="font-bold text-primary text-xl">
                    {formatPrice(deal.price)}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                  <div>면적: {deal.area}㎡</div>
                  <div>층: {deal.floor}층</div>
                  <div>계약일: {deal.date}</div>
                  <div>거래유형: {deal.tradetype}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 