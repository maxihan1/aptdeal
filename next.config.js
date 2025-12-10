/** @type {import('next').NextConfig} */
const nextConfig = {
  // 빌드 최적화
  swcMinify: true,

  // 실험적 기능
  experimental: {
    // Turbopack으로 빠른 빌드 (개발 모드에서 자동 활성화)
    // turbo: {},
  },

  // 빌드 최적화 설정
  compiler: {
    // 불필요한 console.log 제거 (프로덕션)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // 빌드 출력 최적화
  output: 'standalone',

  // TypeScript/ESLint 병렬 처리
  typescript: {
    // 빌드 시 타입 체크 무시 (개발 시에만 체크)
    ignoreBuildErrors: false,
  },
  eslint: {
    // 빌드 시 린트 오류 무시 (개발 시에만 체크)
    ignoreDuringBuilds: true,
  },

  // Webpack 최적화
  webpack: (config, { dev, isServer }) => {
    // 프로덕션 빌드 최적화
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;