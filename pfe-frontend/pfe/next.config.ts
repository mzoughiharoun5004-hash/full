import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      // AI-course images sourced from loremflickr (keyword-aware CC-licensed photos)
      { protocol: 'https', hostname: 'loremflickr.com' },
      // Unsplash CDN (direct image URLs pasted by authors)
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.unsplash.com' },
      // Google Storage – CC0 sample videos placeholder
      { protocol: 'https', hostname: 'commondatastorage.googleapis.com' },
      // Pexels / Pixabay (authors may paste direct media URLs)
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'videos.pexels.com' },
      { protocol: 'https', hostname: 'cdn.pixabay.com' },
      // YouTube thumbnails
      { protocol: 'https', hostname: '*.ytimg.com' },
      // Vimeo thumbnails
      { protocol: 'https', hostname: '*.vimeocdn.com' },
    ],
  },
async headers() {
  // 'unsafe-eval' is dev-only: Turbopack/React use eval() in development for
  // HMR and reconstructing stack traces across environments, but (per
  // React's own warning) never in production, so keep it out of the prod CSP.
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [{
    source: '/(.*)',
    headers: [{
      key: 'Content-Security-Policy',
      // img-src mirrors the images.remotePatterns hostnames above so CSP
      // doesn't block sources next/image is otherwise configured to allow.
      value: [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://images.unsplash.com https://*.unsplash.com https://loremflickr.com https://images.pexels.com https://videos.pexels.com https://cdn.pixabay.com https://*.ytimg.com https://*.vimeocdn.com https://commondatastorage.googleapis.com",
        scriptSrc,
        "connect-src 'self' http://localhost:3001 ws://localhost:3001",
      ].join('; '),
    }]
  }]
},
};

export default nextConfig;
