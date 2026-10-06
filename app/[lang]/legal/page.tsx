import { notFound } from "next/navigation";
import { isLanguage } from "@/lib/marketing";
import { pageMetadata } from "@/lib/seo";
import { LegalIndex } from "../../legal-ui";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return { ...pageMetadata(lang, lang === "ru" ? "Документы сервиса | CS2 Boost" : "Service documents | CS2 Boost", lang === "ru" ? "Пользовательское соглашение, конфиденциальность, оплата и возвраты, cookies сервиса CS2 Boost." : "CS2 Boost terms of use, privacy policy, payments, refunds and browser storage information.", "legal"), robots: { index: false, follow: true } };
}

export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return <LegalIndex lang={lang}/>;
}
