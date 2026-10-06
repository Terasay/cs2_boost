"use client";

import { useEffect, useId, useState } from "react";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { api } from "./account-ui";
import { writeStorage } from "@/lib/browser-storage";
import { captureCampaign } from "@/lib/campaign-storage";
import { commonCopy, services, serviceSlugs, type Language, type Faq } from "@/lib/marketing";
import { Brand } from "./tactical-ui";
import { legalLabels, legalSlugs } from "@/lib/legal-config";

export function MarketingHeader({ lang, slug = "", showMobileCta = true }: { lang: Language; slug?: string; showMobileCta?: boolean }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileCta, setMobileCta] = useState(false);
  const menuId = useId();
  const text = commonCopy[lang];
  useEffect(() => {
    let calculatorVisible = false;
    let footerVisible = false;
    const onScroll = () => { setScrolled(window.scrollY > 24); setMobileCta(showMobileCta && window.scrollY > 350 && !calculatorVisible && !footerVisible); };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target.id === "calculator") calculatorVisible = entry.isIntersecting;
        else footerVisible = entry.isIntersecting;
      }
      onScroll();
    }, { threshold: 0 });
    for (const element of [document.getElementById("calculator"), document.querySelector(".marketing-footer")]) if (element) observer.observe(element);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { observer.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [showMobileCta]);
  useEffect(() => {
    writeStorage("localStorage", "cs2-lang", lang);
    captureCampaign();
    let active = true;
    void api<{ user: unknown }>("/api/auth/me").then(result => { if (active) setSignedIn(Boolean(result.user)); }).catch(() => {});
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => { active = false; document.removeEventListener("keydown", escape); };
  }, [lang]);
  return <><div className={`marketing-navigation${scrolled || open ? " scrolled" : ""}`}><header className="header wrap">
    <Brand href={`/${lang}`}/>
    <nav id={menuId} className={open ? "nav open" : "nav"} aria-label={lang === "ru" ? "Главное меню" : "Main navigation"}>
      <a href={`/${lang}#services`} onClick={() => setOpen(false)}>{text.services}</a><a href={`/${lang}#process`} onClick={() => setOpen(false)}>{text.process}</a><a href={`/${lang}#faq`} onClick={() => setOpen(false)}>{text.faq}</a>
    </nav>
    <div className="header-actions"><div className="language"><a href={`/ru${slug ? `/${slug}` : ""}`} hrefLang="ru" lang="ru" className={lang === "ru" ? "active" : ""} aria-current={lang === "ru" ? "page" : undefined}>RU</a><span>/</span><a href={`/en${slug ? `/${slug}` : ""}`} hrefLang="en" lang="en" className={lang === "en" ? "active" : ""} aria-current={lang === "en" ? "page" : undefined}>EN</a></div><a className="login-link" href={signedIn ? "/dashboard" : "/login"}>{signedIn ? text.account : text.login}</a><a className="header-start tactical-primary" href={`/${lang}#calculator`}>{lang === "ru" ? "Рассчитать" : "Calculate"}<ArrowUpRight size={16}/></a><button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-controls={menuId} aria-expanded={open} aria-label={lang === "ru" ? (open ? "Закрыть меню" : "Открыть меню") : (open ? "Close menu" : "Open menu")}>{open ? <X/> : <Menu/>}</button></div>
  </header></div><div className={`mobile-order-cta${mobileCta ? " visible" : ""}`}><a href={`/${lang}#calculator`} className="tactical-primary">{lang === "ru" ? "Рассчитать стоимость" : "Calculate your price"}<ArrowUpRight size={18}/></a></div></>;
}

export function MarketingFooter({ lang, compact = false }: { lang: Language; compact?: boolean }) {
  const text = commonCopy[lang];
  const ru = lang === "ru";
  return <footer className="marketing-footer">
    {!compact && <div className="final-objective"><div className="wrap footer-cta"><div><span className="kicker">READY // NEXT MATCH</span><h2>{ru ? <>Ваша следующая цель<br/>начинается здесь.</> : <>Your next goal<br/>starts here.</>}</h2><p>{ru ? "Рассчитайте стоимость до регистрации. Для буста цена и срок известны заранее; калибровка согласуется отдельно." : "Calculate before signing up. Rating boosts show the price and duration in advance; calibration is agreed separately."}</p></div><a href={`/${lang}#calculator`} className="tactical-primary">{ru ? "Рассчитать стоимость" : "Calculate your price"}<ArrowUpRight size={20}/></a></div></div>}
    <div className="wrap marketing-footer-grid">
      <div><Brand href={`/${lang}`}/><p>{text.footer}</p><small>{text.independence}</small></div>
      <nav aria-label={ru ? "Услуги в подвале" : "Footer services"}><h3>{text.services}</h3>{serviceSlugs.map(slug => <a key={slug} href={`/${lang}/${slug}`}>{services[lang][slug].heading}</a>)}</nav>
      <nav aria-label={ru ? "Перед заказом" : "Before ordering"}><h3>{ru ? "Перед заказом" : "Before ordering"}</h3><a href={`/${lang}#security`}>{ru ? "Оплата и доступ" : "Payment & account access"}</a><a href={`/${lang}#faq`}>{ru ? "Вопросы и риски" : "Questions & risks"}</a><a href={`/${lang}#process`}>{text.process}</a></nav>
      <nav aria-label={text.support}><h3>{ru ? "На связи" : "Get in touch"}</h3><a href="/support">{text.support}</a><a href="/dashboard">{text.account}</a><a href={`/${lang}#calculator`}>{ru ? "Рассчитать" : "Calculate"}<ArrowRight size={13}/></a></nav>
    </div>
    <nav className="wrap footer-legal-links" aria-label={ru ? "Документы сервиса" : "Service documents"}><strong>{ru ? "ДОКУМЕНТЫ" : "DOCUMENTS"}</strong>{legalSlugs.map(slug => <a key={slug} href={`/${lang}/legal/${slug}`}>{legalLabels[lang][slug]}</a>)}<a href={`/${lang}/legal`}>{ru ? "Все документы" : "All documents"}<ArrowUpRight size={12}/></a></nav>
    <div className="wrap footer-baseline"><span>CS2 BOOST / PREMIER + FACEIT</span><span>DUO / PILOTED</span></div>
  </footer>;
}

export function FaqList({ items }: { items: Faq[] }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  return <div className="faq-list">{items.map((item, index) => <div className={active === index ? "faq-item open" : "faq-item"} key={item.question}><button type="button" className="faq-question" aria-expanded={active === index} aria-controls={`${id}-answer-${index}`} onClick={() => setActive(active === index ? null : index)}><span className="faq-number" aria-hidden="true">{String(index+1).padStart(2,"0")}</span><b>{item.question}</b><span className="faq-plus" aria-hidden="true">+</span></button><div className="faq-answer" id={`${id}-answer-${index}`} aria-hidden={active !== index}><div><p>{item.answer}</p></div></div></div>)}</div>;
}
