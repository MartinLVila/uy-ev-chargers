import type { NextConfig } from "next";

const TILE_HOST = "https://*.tile.openstreetmap.org";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: ${TILE_HOST}`,
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "upgrade-insecure-requests",
].join("; ");

const strictTransportSecurity = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

const EVERYTHING_EXCEPT_THE_API = "/((?!api/).*)";

const pageOnlyHeaders = [{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const STATION_PAGES_PER_WORKER = 64;
const PAGES_RENDERED_AT_ONCE_PER_WORKER = 4;

const nextConfig: NextConfig = {
  experimental: {
    staticGenerationMinPagesPerWorker: STATION_PAGES_PER_WORKER,
    staticGenerationMaxConcurrency: PAGES_RENDERED_AT_ONCE_PER_WORKER,
  },

  async headers() {
    const headers =
      process.env.NODE_ENV === "production"
        ? [
            ...securityHeaders,
            strictTransportSecurity,
            { key: "Content-Security-Policy", value: contentSecurityPolicy },
          ]
        : securityHeaders;

    return [
      { source: "/:path*", headers },
      { source: EVERYTHING_EXCEPT_THE_API, headers: pageOnlyHeaders },
    ];
  },
};

export default nextConfig;
