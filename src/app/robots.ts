import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/**
 * Robots (architecture §15.3). Public site is allowed; admin pages and admin
 * API are blocked from indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
