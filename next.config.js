/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    // webpack 설정 강화
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    // AppPass 환경에서의 호환성 강화
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        path: false,
        os: false,
      };
    }
    
    return config;
  },
  // 빌드 최적화
  compress: true,
};

module.exports = nextConfig; 