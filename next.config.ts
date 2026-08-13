import type { NextConfig } from "next";

/**
 * Derive the exact `images.remotePatterns` from the same ALLOWED_IMAGE_HOSTS
 * whitelist used by the image URL policy (architecture §16.1). No wildcards.
 */
function parseAllowedImageHosts(): Array<{ protocol: "https"; hostname: string }> {
  const raw = process.env.ALLOWED_IMAGE_HOSTS ?? "";
  return raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map((hostname) => ({ protocol: "https" as const, hostname }));
}

const nextConfig: NextConfig = {
  // Next.js 16 Cache Components (architecture §13.2)
  cacheComponents: true,
  cacheLife: {
    blog: {
      stale: 300, // 5 min stale-while-revalidate
      revalidate: 3600, // 1 h refresh window
      expire: 86400, // 24 h hard expiry
    },
  },
  images: {
    remotePatterns: parseAllowedImageHosts(),
  },
  // Native modules / DB driver must stay external on the server runtime.
  serverExternalPackages: [
    "@node-rs/argon2",
    "pg",
    "@prisma/client",
    "@prisma/adapter-pg",
    "shiki",
  ],
  // Security response headers (architecture §23.4). The CSP is pragmatic:
  // Next.js injects inline scripts/styles for hydration + the RSC stream, and
  // Shiki emits inline theme styles in code blocks, so `'unsafe-inline'` is
  // required for script/style sources. `frame-ancestors 'none'`, `object-src
  // 'none'`, `base-uri 'self'` and `form-action 'self'` still contain the
  // largest clickjacking / injection / UI-redress surfaces. Deploy on Vercel
  // also sets these at the platform level.
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      // HSTS (FIND-211 fix): self-hosted deployments without a platform-level
      // HSTS guarantee still get upgrade enforcement. Browsers ignore this
      // header for localhost and over plain HTTP, so local `next start` on
      // http://localhost is unaffected.
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    ];
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
