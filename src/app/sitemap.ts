import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

// 아파트 데이터를 Supabase에서 가져오는 함수
async function getAptList(): Promise<string[]> {
  try {
    // Supabase에서 고유한 아파트명 목록을 가져옴
    const { data, error } = await supabase
      .from('apt_deals')
      .select('aptname')
      .not('aptname', 'is', null)
      .limit(1000) // 최대 1000개 아파트만 가져옴 (sitemap 크기 제한 고려)
    
    if (error) {
      console.warn('아파트 목록을 가져오는데 실패했습니다:', error)
      return []
    }
    
    // 중복 제거 및 필터링
    const uniqueAptNames = [...new Set(
      data
        .map(item => item.aptname)
        .filter(Boolean)
        .filter(name => typeof name === 'string' && name.trim().length > 0)
    )]
    
    return uniqueAptNames
  } catch (error) {
    console.warn('아파트 목록 조회 중 오류:', error)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://aptdeal.kr'
  const currentDate = new Date()
  
  // 정적 페이지들
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/region`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  // 아파트 목록 가져오기
  const aptList = await getAptList()
  
  // 동적 아파트 페이지들 (최대 1000개로 제한)
  const aptPages: MetadataRoute.Sitemap = aptList.slice(0, 1000).map(aptName => ({
    url: `${baseUrl}/region/${encodeURIComponent(aptName)}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // 아파트 면적별 페이지들 (최대 1000개로 제한)
  const aptAreaPages: MetadataRoute.Sitemap = aptList.slice(0, 1000).map(aptName => ({
    url: `${baseUrl}/region/${encodeURIComponent(aptName)}/areas`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...aptPages, ...aptAreaPages]
} 