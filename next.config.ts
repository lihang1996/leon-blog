import type { NextConfig } from "next";

/**
 * Derive the exact `images.remotePatterns` from the same ALLOWED_IMAGE_HOSTS
 * whitelist used by the image URL policy (architecture §16.1). No wildcards.
 */
function parseAllowedImageHosts(): Array<{ protocol: "https"; hostname: string }> {
  const raw = process.env.ALLOWED_IMAGE_HOSTS ?? "";
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((hostname) => ({ protocol: "https" as const, hostname }));
}

const nextConfig: NextConfig = {
  // Non-secret host policy used by the browser renderer. Publish validation is
  // still authoritative on the server.
  env: {
    NEXT_PUBLIC_ALLOWED_IMAGE_HOSTS: process.env.ALLOWED_IMAGE_HOSTS ?? "",
    // Stable for the whole deployment and refreshed on every build. Keeping
    // this out of Client Component render avoids Cache Components treating
    // `new Date()` as request-time IO during prerendering.
    NEXT_PUBLIC_COPYRIGHT_YEAR: String(new Date().getFullYear()),
  },
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
  ],
  // Next.js hydration and the RSC stream require inline scripts/styles.
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
