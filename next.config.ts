import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Report-only first: once the reports are clean it becomes enforcing. GA is
// allowed because the marketing site loads it after consent.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self'",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.r2.cloudflarestorage.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const OG_IMAGE = "(?:.*/)?opengraph-image";
// Paths that never get the /nl rewrite: the product, the API, Next internals,
// locale-prefixed paths and files (anything with a dot, like /robots.txt).
const NOT_MARKETING = "(?:app|api|_next|en|nl)(?:/|$)|.*\\..*";

const nextConfig: NextConfig = {
  // The smoke test builds into its own folder so it never touches the build prod serves.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // tsc (npm run typecheck) covers types; the smoke build must not clash with .next/types.
  typescript: {
    ignoreBuildErrors: Boolean(process.env.NEXT_DIST_DIR),
    tsconfigPath: process.env.NEXT_DIST_DIR ? "tsconfig.smoke.json" : "tsconfig.json",
  },
  experimental: {
    globalNotFound: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/app/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/app",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    // The product moved from `/` to `/app`; old bookmarks and invite emails keep working.
    return [
      { source: "/invite/:token", destination: "/app/invite/:token", permanent: true },
      { source: "/sign-in", destination: "/app/sign-in", permanent: true },
      { source: "/sign-up", destination: "/app/sign-up", permanent: true },
      { source: "/welcome", destination: "/app/welcome", permanent: true },
      { source: "/o/:path*", destination: "/app/o/:path*", permanent: true },
      // Security and privacy moved into the Terms page.
      { source: "/security", destination: "/terms", permanent: true },
      { source: "/en/security", destination: "/en/terms", permanent: true },
      // Dutch has no prefix: /nl/x is only an internal path.
      { source: "/nl", destination: "/", permanent: true },
      { source: `/nl/:path((?!${OG_IMAGE}).*)`, destination: "/:path", permanent: true },
    ];
  },
  async rewrites() {
    // Dutch lives at `/`: every marketing path without a locale is served from
    // the prerendered /nl tree. No browser-language detection anywhere.
    return {
      beforeFiles: [
        { source: "/", destination: "/nl" },
        { source: `/:path((?!${NOT_MARKETING}).+)`, destination: "/nl/:path" },
      ],
    };
  },
};

export default withNextIntl(nextConfig);
