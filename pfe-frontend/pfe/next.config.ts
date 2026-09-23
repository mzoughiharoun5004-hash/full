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
  // The SCORM viewer (/dashboard/scorm-viewer) embeds an iframe served by the
  // backend (a different origin/port from this app). CSP has no frame-src
  // fallback to connect-src — only to child-src, then default-src 'self' —
  // so without an explicit allowance here that iframe is silently blocked.
  // connect-src below is derived from this same origin (rather than a second
  // hardcoded localhost literal) so the app's own axios/socket.io calls don't
  // get silently blocked once NEXT_PUBLIC_API_URL points at a real backend.
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  return [{
    source: '/(.*)',
    headers: [{
      key: 'Content-Security-Policy',
      // img-src mirrors the images.remotePatterns hostnames above so CSP
      // doesn't block sources next/image is otherwise configured to allow.
      value: [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: ${apiOrigin} https://images.unsplash.com https://*.unsplash.com https://loremflickr.com https://images.pexels.com https://videos.pexels.com https://cdn.pixabay.com https://*.ytimg.com https://*.vimeocdn.com https://commondatastorage.googleapis.com`,
        `media-src 'self' ${apiOrigin}`,
        scriptSrc,
        `frame-src 'self' ${apiOrigin}`,
        `connect-src 'self' ${apiOrigin} ${apiOrigin.replace(/^http/, 'ws')}`,
      ].join('; '),
    }]
  }]
},
};

export default nextConfig;
