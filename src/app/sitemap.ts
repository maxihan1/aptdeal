import { MetadataRoute } from 'next'
import { getAptList } from '@/lib/database'

// 아파트 데이터를 가져오는 함수 (MySQL 환경 변수 체크)
async function getAptListForSitemap(): Promise<string[]> {
  // MySQL 환경 변수가 없으면 빈 배열 반환
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) {
    console.warn('MySQL 환경 변수가 설정되지 않아 기본 sitemap을 생성합니다.');
    return [];
  }

  try {
    // MySQL에서 고유한 아파트명 목록을 가져옴
    const aptList = await getAptList();
    
    // 중복 제거 및 필터링
    const uniqueAptNames = [...new Set(
      aptList
        .map(item => (item as Record<string, unknown>).kaptName as string)
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
  const aptList = await getAptListForSitemap()
  
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