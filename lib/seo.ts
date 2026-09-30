import type { Metadata } from "next";
import type { Language } from "./marketing";
import { searchEnabled, siteOrigin } from "./seo-config.mjs";

export function pageMetadata(lang: Language, title: string, description: string, slug = ""): Metadata {
  const origin = siteOrigin();
  const path = `/${lang}${slug ? `/${slug}` : ""}`;
  return {
    title, description,
    robots: { index: searchEnabled(), follow: true },
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: origin + path, languages: { ru: `${origin}/ru${slug ? `/${slug}` : ""}`, en: `${origin}/en${slug ? `/${slug}` : ""}`, "x-default": `${origin}/ru${slug ? `/${slug}` : ""}` } } } : {}),
    openGraph: { title, description, type: "website", siteName: "CS2 Boost", locale: lang === "ru" ? "ru_RU" : "en_US", alternateLocale: lang === "ru" ? "en_US" : "ru_RU", ...(origin ? { url: origin + path, images: [{ url: origin + "/hero-arena.png", width: 1536, height: 1024, alt: "CS2 Boost — Premier & FACEIT" }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(origin ? { images: [origin + "/hero-arena.png"] } : {}) },
  };
}
