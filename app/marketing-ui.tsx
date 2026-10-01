"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Crosshair, Menu, X } from "lucide-react";
import { api } from "./account-ui";
import { writeStorage } from "@/lib/browser-storage";
import { captureCampaign } from "@/lib/campaign-storage";
import { commonCopy, services, serviceSlugs, type Language, type Faq } from "@/lib/marketing";

export function MarketingHeader({ lang, slug = "" }: { lang: Language; slug?: string }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const text = commonCopy[lang];
  useEffect(() => {
    writeStorage("localStorage", "cs2-lang", lang);
    captureCampaign();
    let active = true;
    void api<{ user: unknown }>("/api/auth/me").then(result => { if (active) setSignedIn(Boolean(result.user)); }).catch(() => {});
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => { active = false; document.removeEventListener("keydown", escape); };
  }, [lang]);
  return <><div className="topbar"><span>COUNTER-STRIKE 2</span><span>PREMIER / FACEIT</span></div><header className="header wrap">
    <a href={`/${lang}`} className="brand"><span className="brand-mark"><Crosshair size={22}/></span>CS2<span>BOOST</span></a>
    <nav className={open ? "nav open" : "nav"} aria-label={lang === "ru" ? "Главное меню" : "Main navigation"}>
      <a href={`/${lang}#services`} onClick={() => setOpen(false)}>{text.services}</a><a href={`/${lang}#process`} onClick={() => setOpen(false)}>{text.process}</a><a href={`/${lang}#faq`} onClick={() => setOpen(false)}>{text.faq}</a>
    </nav>
    <div className="header-actions"><div className="language"><a href={`/ru${slug ? `/${slug}` : ""}`} hrefLang="ru" lang="ru" className={lang === "ru" ? "active" : ""} aria-current={lang === "ru" ? "page" : undefined}>RU</a><span>/</span><a href={`/en${slug ? `/${slug}` : ""}`} hrefLang="en" lang="en" className={lang === "en" ? "active" : ""} aria-current={lang === "en" ? "page" : undefined}>EN</a></div><a className="login-link" href={signedIn ? "/dashboard" : "/login"}>{signedIn ? text.account : text.login}<ArrowRight size={16}/></a><button className="menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={lang === "ru" ? (open ? "Закрыть меню" : "Открыть меню") : (open ? "Close menu" : "Open menu")}>{open ? <X/> : <Menu/>}</button></div>
  </header></>;
}

export function MarketingFooter({ lang }: { lang: Language }) {
  const text = commonCopy[lang];
  return <footer className="marketing-footer"><div className="wrap footer-cta"><div><span className="kicker">PREMIER / FACEIT</span><h2>{lang === "ru" ? "Следующий шаг — ваша цель." : "Your next step starts with a goal."}</h2></div><a href={`/${lang}#calculator`} className="compact-primary">{text.request}<ArrowRight size={17}/></a></div><div className="wrap marketing-footer-grid"><div><a href={`/${lang}`} className="brand">CS2<span>BOOST</span></a><p>{text.footer}</p><small>{text.independence}</small></div><nav aria-label={lang === "ru" ? "Услуги в подвале" : "Footer services"}><h3>{text.services}</h3>{serviceSlugs.map(slug => <a key={slug} href={`/${lang}/${slug}`}>{services[lang][slug].heading}</a>)}</nav><nav aria-label={text.support}><h3>{lang === "ru" ? "На связи" : "Get in touch"}</h3><a href="/support">{text.support}</a><a href="/dashboard">{text.account}</a><a href={`/${lang}#calculator`}>{text.request} ↑</a></nav></div></footer>;
}

export function FaqList({ items }: { items: Faq[] }) {
  const [active, setActive] = useState<number | null>(null);
  return <div className="faq-list">{items.map((item, index) => <div className={active === index ? "faq-item open" : "faq-item"} key={item.question}><button className="faq-question" aria-expanded={active === index} aria-controls={`answer-${index}`} onClick={() => setActive(active === index ? null : index)}>{item.question}<span aria-hidden="true">+</span></button><div className="faq-answer" id={`answer-${index}`} aria-hidden={active !== index}><div><p>{item.answer}</p></div></div></div>)}</div>;
}
