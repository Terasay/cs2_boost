import type { MetadataRoute } from "next";
import { searchEnabled, siteOrigin } from "@/lib/seo-config.mjs";

export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, ...(searchEnabled() ? { sitemap: `${siteOrigin()}/sitemap.xml` } : {}) };
}
