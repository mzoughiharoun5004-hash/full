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
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
