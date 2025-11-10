import type { NextConfig } from "next";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://webapi.amap.com https://*.amap.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.amap.com",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://webapi.amap.com https://restapi.amap.com https://*.amap.com https://dashscope.aliyuncs.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob: https://*.amap.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: CONTENT_SECURITY_POLICY,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(self), payment=(), fullscreen=(self)",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
