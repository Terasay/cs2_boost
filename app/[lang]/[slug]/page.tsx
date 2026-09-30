import { notFound } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Check, Crosshair, MessageSquare } from "lucide-react";
import { MarketingHeader, MarketingFooter, FaqList } from "../../marketing-ui";
import { commonCopy, services, serviceSlugs, isLanguage, isServiceSlug } from "@/lib/marketing";
import { pageMetadata } from "@/lib/seo";
import { siteOrigin } from "@/lib/seo-config.mjs";

type Props = { params: Promise<{ lang: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLanguage(lang) || !isServiceSlug(slug)) notFound();
  const content = services[lang][slug];
  return pageMetadata(lang, content.title, content.description, slug);
}

export default async function ServicePage({ params }: Props) {
  const { lang, slug } = await params;
  if (!isLanguage(lang) || !isServiceSlug(slug)) notFound();
  const content = services[lang][slug];
  const text = commonCopy[lang];
  const requestHref = `/${lang}?platform=${content.platform}&service=${content.service}#calculator`;
  const origin = siteOrigin();
  const structured = origin ? {
    "@context": "https://schema.org", "@graph": [
      { "@type": "Service", "@id": `${origin}/${lang}/${slug}#service`, name: content.heading, description: content.description, url: `${origin}/${lang}/${slug}`, provider: { "@type": "Organization", name: "CS2 Boost", url: `${origin}/${lang}` } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: text.home, item: `${origin}/${lang}` }, { "@type": "ListItem", position: 2, name: content.heading, item: `${origin}/${lang}/${slug}` }] },
    ],
  } : null;
  return <div className="site service-page"><MarketingHeader lang={lang} slug={slug}/><main>
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}/>}
    <section className="service-hero wrap"><nav className="breadcrumbs" aria-label={lang === "ru" ? "Путь страницы" : "Breadcrumb"}><a href={`/${lang}`}>{text.home}</a><span>/</span><span>{content.label}</span></nav><div className="service-hero-grid"><div><span className="eyebrow">CS2 / {content.label}</span><h1>{content.heading}</h1><p>{content.intro}</p><a href={requestHref} className="link-button">{text.request}<ArrowRight size={18}/></a><div className="service-caption"><MessageSquare size={16}/>{lang === "ru" ? "Условия подтверждаются до оплаты" : "Terms confirmed before payment"}</div></div><div className="service-visual"><Image src="/hero-arena.png" alt="" width={1536} height={1024} priority/><div><span>{content.label}</span><strong>{lang === "ru" ? "Ваша цель. Согласованный план." : "Your goal. Agreed terms."}</strong></div></div></div></section>
    <section className="content-block alt"><div className="wrap service-overview"><div><span className="kicker">{content.label}</span><h2>{text.included}</h2><p>{content.overview}</p></div><ul className="service-checklist">{content.details.map(detail => <li key={detail}><Check size={19}/><span>{detail}</span></li>)}</ul></div></section>
    <section className="content-block"><div className="wrap"><span className="kicker">DUO / PILOTED</span><h2>{text.methods}</h2><div className="method-explanation"><article><Crosshair size={25}/><h3>{text.duo}</h3><p>{text.duoText}</p></article><article><MessageSquare size={25}/><h3>{text.piloted}</h3><p>{text.pilotedText}</p></article></div><p className="service-risk">{text.safety}</p></div></section>
    <section className="content-block alt"><div className="wrap service-overview"><div><span className="kicker">{lang === "ru" ? "ПРЕДЛОЖЕНИЕ" : "YOUR OFFER"}</span><h2>{text.pricing}</h2><p>{content.quote}</p><a className="service-text-link" href={requestHref}>{text.request}<ArrowRight size={17}/></a></div><div className="preparation"><h3>{text.prepare}</h3><ol>{content.preparation.map(step => <li key={step}>{step}</li>)}</ol></div></div></section>
    <section className="content-block"><div className="wrap"><span className="kicker">{text.process.toUpperCase()}</span><h2>{lang === "ru" ? "От заявки до результата" : "From request to completion"}</h2><div className="steps service-steps">{text.steps.map((step, index) => <div key={step.title}><strong>0{index + 1}</strong><h3>{step.title}</h3><p>{step.text}</p></div>)}</div></div></section>
    <section className="content-block alt"><div className="wrap faq-layout"><div><span className="kicker">FAQ</span><h2>{text.faq}</h2></div><FaqList items={[...content.faq, ...text.questions]}/></div></section>
    <section className="content-block"><div className="wrap"><div className="service-final"><div><h2>{text.finalTitle}</h2><p>{text.finalText}</p></div><a className="link-button" href={requestHref}>{text.request}<ArrowRight size={18}/></a></div><h2 className="related-heading">{text.other}</h2><div className="related-services">{serviceSlugs.filter(other => other !== slug).map(other => <a key={other} href={`/${lang}/${other}`}><span>{services[lang][other].heading}</span><ArrowRight size={20}/></a>)}</div></div></section>
  </main><MarketingFooter lang={lang}/></div>;
}
