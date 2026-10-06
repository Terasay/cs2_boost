import { notFound } from "next/navigation";
import { isLanguage } from "@/lib/marketing";
import { isLegalSlug, legalLabels } from "@/lib/legal-config";
import { legalContent } from "@/lib/legal-content";
import { pageMetadata } from "@/lib/seo";
import { LegalArticle } from "../../../legal-ui";

type Props = { params: Promise<{ lang: string; document: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang, document } = await params;
  if (!isLanguage(lang) || !isLegalSlug(document)) notFound();
  return { ...pageMetadata(lang, `${legalLabels[lang][document]} | CS2 Boost`, legalContent[lang][document].description, `legal/${document}`), robots: { index: false, follow: true } };
}

export default async function Page({ params }: Props) {
  const { lang, document } = await params;
  if (!isLanguage(lang) || !isLegalSlug(document)) notFound();
  return <LegalArticle lang={lang} slug={document}/>;
}
