import { notFound } from "next/navigation";
import Home from "../home";
import { isLanguage } from "@/lib/marketing";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return pageMetadata(lang, lang === "ru" ? "Буст CS2 — Premier, FACEIT и калибровка | CS2 Boost" : "CS2 Boost — Premier, FACEIT and Calibration", lang === "ru" ? "Буст рейтинга CS2 и калибровка для Premier и FACEIT. Выберите игру вместе или выполнение на аккаунте. Цена, срок и чат с администратором в личном кабинете." : "CS2 rating boosts and calibration for Premier and FACEIT. Choose duo or piloted play, agree on a price and deadline, and follow your order in the admin chat.");
}

export default async function LocalizedHome({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  const query = await searchParams;
  return <Home lang={lang} initialPlatform={query.platform === "faceit" ? "faceit" : "premier"} initialService={query.service === "calibration" ? "calibration" : "rating"}/>;
}
