import type { MetadataRoute } from "next";
import { languages, serviceSlugs } from "@/lib/marketing";
import { searchEnabled, siteOrigin } from "@/lib/seo-config.mjs";

export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  if (!searchEnabled()) return [];
  const origin = siteOrigin();
  return languages.flatMap(lang => ["", ...serviceSlugs].map(slug => ({
    url: `${origin}/${lang}${slug ? `/${slug}` : ""}`,
    alternates: { languages: { ru: `${origin}/ru${slug ? `/${slug}` : ""}`, en: `${origin}/en${slug ? `/${slug}` : ""}` } },
  })));
}
