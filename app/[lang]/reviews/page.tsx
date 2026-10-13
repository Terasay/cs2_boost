import { notFound } from "next/navigation";
import { isLanguage } from "@/lib/marketing";
import { pageMetadata } from "@/lib/seo";
import { publicReviews } from "@/lib/reviews";
import { MarketingHeader, MarketingFooter } from "../../marketing-ui";
import { ReviewsSection } from "../../review-cards";

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return pageMetadata(lang, lang === "ru" ? "Отзывы клиентов CS2 Boost — Premier и FACEIT" : "CS2 Boost client reviews — Premier and FACEIT", lang === "ru" ? "Оценки и отзывы клиентов после выполнения заказов CS2 Premier, FACEIT и калибровки." : "Client ratings and reviews after completed CS2 Premier, FACEIT and calibration orders.", "reviews");
}

export default async function Reviews({ params, searchParams }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  const query = await searchParams;
  const value = query.page ?? "1";
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) notFound();
  return <div className="site tactical-home"><MarketingHeader lang={lang} slug="reviews" showMobileCta={false}/><main className="reviews-page"><ReviewsSection report={publicReviews(Number(value))} lang={lang} full/></main><MarketingFooter lang={lang} compact/></div>;
}
