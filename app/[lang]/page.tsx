import { notFound } from "next/navigation";
import Home from "../home";
import { isLanguage } from "@/lib/marketing";
import { pageMetadata } from "@/lib/seo";
import { siteOrigin } from "@/lib/seo-config.mjs";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return pageMetadata(lang, lang === "ru" ? "Буст CS2 — Premier, FACEIT и калибровка | CS2 Boost" : "CS2 Boost — Premier, FACEIT and Calibration", lang === "ru" ? "Буст CS2: Premier от 500 ₽ за 1 000 рейтинга, FACEIT от 500 ₽ за 100 ELO и калибровка. Калькулятор цены и срока, игра вместе или на аккаунте, чат заказа." : "CS2 boost: Premier from 500 RUB per 1,000 rating and FACEIT from 500 RUB per 100 ELO. Calculate price and duration, choose duo or piloted play.");
}

export default async function LocalizedHome({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  const query = await searchParams;
  const origin = siteOrigin();
  const website = origin ? {
    "@context": "https://schema.org", "@type": "WebSite", "@id": `${origin}/#website`,
    name: "CS2 Boost", alternateName: [new URL(origin).hostname], url: `${origin}/`, inLanguage: ["ru", "en"],
  } : null;
  return <>
    {website && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }}/>}
    <Home lang={lang} initialPlatform={query.platform === "faceit" ? "faceit" : "premier"} initialService={query.service === "calibration" ? "calibration" : "rating"}/>
  </>;
}
