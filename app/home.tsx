"use client";

import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "@/lib/browser-storage";
import { calculatePrice, type Price } from "@/lib/pricing.mjs";
import { PriceSummary, PromoInput } from "./price-summary";
import { api, readDraft } from "./account-ui";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Crosshair, LockKeyhole, MessageSquare, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, ObjectiveHud, RatingControl } from "./tactical-ui";

import { MarketingHeader, MarketingFooter } from "./marketing-ui";
import { PlayingMethods, AccountShowcase } from "./home-showcase";
import { HomeFaq, SecuritySection, ServiceObjective } from "./marketing-trust";
import { commonCopy, services, serviceSlugs, type Language as Lang } from "@/lib/marketing";
type Platform = "premier" | "faceit";
type Service = "rating" | "calibration";
type Method = "duo" | "piloted";

const words = {
  ru: {
    services:"Услуги", process:"Как это работает", faq:"Вопросы", login:"Войти", eyebrow:"CS2 / PREMIER / FACEIT",
    title1:"БУСТ CS2",title2:"PREMIER / FACEIT",intro:"Рассчитайте цену и срок до оплаты. Играйте вместе с исполнителем или поручите ему выполнение на аккаунте.",
    benefit1:"Premier и FACEIT",benefit2:"Чат с администратором",config:"НАСТРОЙКА ЗАКАЗА",configTitle:"Ваш маршрут к рейтингу",
    platform:"Площадка",service:"Услуга",rating:"Буст рейтинга",calibration:"Калибровка",method:"Способ выполнения",duo:"Игра вместе",piloted:"На вашем аккаунте",
    current:"Текущий рейтинг",target:"Желаемый рейтинг",calibrationHint:"Условия калибровки уточним после заявки.",
    quote:"Стоимость и срок",quoteValue:"Индивидуальный расчёт",quoteHint:"Администратор предложит цену и дату завершения. Вы подтвердите условия до оплаты.",
    continue:"Продолжить оформление",accountLater:"Аккаунт создаётся на следующем шаге",invalid:"Укажите текущий и желаемый рейтинг. Цель должна быть выше текущего.",
    serviceTitle:"Под ваш формат игры",s1:"Буст рейтинга",s1d:"Выберите Premier или FACEIT и укажите свой целевой рейтинг.",s2:"Калибровка",s2d:"Согласуем цель и условия перед началом матчей.",s3:"Два способа",s3d:"Играйте вместе с исполнителем или выберите выполнение на аккаунте.",
    processTitle:"Три шага до заказа",p1:"Задайте цель",p1d:"Выберите площадку, услугу и желаемый результат.",p2:"Согласуйте условия",p2d:"Администратор подтвердит цену и срок.",p3:"Следите за работой",p3d:"Статус заказа и чат доступны в личном кабинете.",
    faqTitle:"Перед оформлением",q1:"Когда будет известна цена?",a1:"Для буста цена и срок видны в калькуляторе и сохраняются при оформлении. Тариф зависит от исходного рейтинга; красный траст в Premier добавляет 10%, промокод даёт скидку 20%. Условия калибровки согласуются отдельно.",q2:"Нужно ли создавать аккаунт сразу?",a2:"Нет. Сначала выберите параметры, затем создайте аккаунт для оформления заказа.",q3:"Можно ли играть вместе с исполнителем?",a3:"Да, выберите «Игра вместе» в форме заказа."
  },
  en: {
    services:"Services",process:"How it works",faq:"FAQ",login:"Sign in",eyebrow:"CS2 / PREMIER / FACEIT",
    title1:"CS2 BOOST",title2:"PREMIER / FACEIT",intro:"Know the price and duration before paying. Play with the booster or choose delivery on your account.",
    benefit1:"Premier and FACEIT",benefit2:"Direct admin chat",config:"CONFIGURE YOUR ORDER",configTitle:"Your route to the next rank",
    platform:"Platform",service:"Service",rating:"Rating boost",calibration:"Calibration",method:"Boost method",duo:"Play together",piloted:"On your account",
    current:"Current rating",target:"Target rating",calibrationHint:"We'll confirm calibration details after your request.",
    quote:"Price and deadline",quoteValue:"Personal quote",quoteHint:"An admin will offer a price and completion date. You accept the terms before paying.",
    continue:"Continue to order",accountLater:"Create an account in the next step",invalid:"Enter your current and target rating. The target must be higher.",
    serviceTitle:"Your game, your format",s1:"Rating boost",s1d:"Choose Premier or FACEIT and set your target rating.",s2:"Calibration",s2d:"Agree on the goal and terms before matches start.",s3:"Two methods",s3d:"Play with the booster or arrange a piloted order.",
    processTitle:"Three steps to order",p1:"Set your goal",p1d:"Choose the platform, service and target.",p2:"Agree on terms",p2d:"An admin confirms the price and deadline.",p3:"Track progress",p3d:"Order status and chat are available in your account.",
    faqTitle:"Before you order",q1:"When will I know the price?",a1:"For rating boosts, the calculator shows the price and duration before you submit. The rate depends on your starting rating; Premier red trust adds 10%, and a promo code takes 20% off. Calibration is agreed separately.",q2:"Do I need an account right away?",a2:"No. Configure your request first, then create an account to submit it.",q3:"Can I play with the booster?",a3:"Yes. Choose “Play together” in the order form."
  }
};

export default function Home({ lang, initialPlatform = "premier", initialService = "rating" }: { lang: Lang; initialPlatform?: Platform; initialService?: Service }) {
  const [platform,setPlatform]=useState<Platform>(initialPlatform);
  const [service,setService]=useState<Service>(initialService);
  const [method,setMethod]=useState<Method>("duo");
  const [current,setCurrent]=useState(initialPlatform === "faceit" ? "1000" : "4500");
  const [target,setTarget]=useState(initialPlatform === "faceit" ? "1500" : "10000");
  const [redTrust,setRedTrust]=useState(false);
  const [promoCode,setPromoCode]=useState("");
  const [error,setError]=useState("");
  const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{let active=true;void api<{user:unknown}>("/api/auth/me").then(result=>{if(active)setSignedIn(Boolean(result.user))}).catch(()=>{});return()=>{active=false}},[]);
  const t=words[lang];
  useEffect(()=>{
    const query = new URLSearchParams(window.location.search);
    const promo = query.get("promo");
    const timer = setTimeout(()=>{
      const draft = query.get("resume") === "1" ? readDraft() : null;
      if (draft) {
        setPlatform(draft.platform);setService(draft.service);setMethod(draft.method);
        setCurrent(draft.current === null ? "" : String(draft.current));setTarget(draft.target === null ? "" : String(draft.target));setRedTrust(draft.redTrust === true);
      }
      setPromoCode(promo?.slice(0,32) ?? draft?.promoCode ?? readStorage("sessionStorage","cs2-promo") ?? "");
      if (promo !== null) writeStorage("sessionStorage","cs2-promo",promo.slice(0,32));
    },0);
    return()=>clearTimeout(timer);
  },[]);
  let price: Price | null = null;
  let priceProblem = "";
  try { if(service === "calibration" || (current && target))price = calculatePrice({platform,service,current:Number(current),target:Number(target),redTrust:platform === "premier" && redTrust,promoCode}); }
  catch(reason) { priceProblem = reason instanceof Error && reason.message === "Unknown promo code" ? (lang === "ru" ? "Исправьте промокод или удалите его, чтобы рассчитать стоимость." : "Correct or remove the promo code to calculate the price.") : t.invalid; }
  useEffect(()=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window))return;
    const elements=document.querySelectorAll<HTMLElement>(".tactical-section .section-heading,.service-module,.playing-card,.account-preview,.showcase-copy,.process-rail,.faq-layout>div");
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}}},{threshold:.12,rootMargin:"0px 0px -35px 0px"});
    elements.forEach(element=>{element.classList.add("scroll-reveal");observer.observe(element)});
    return()=>observer.disconnect();
  },[]);
  function changePlatform(value: Platform) {
    if (value === platform) return;
    setPlatform(value);
    setCurrent(value === "faceit" ? "1000" : "4500");
    setTarget(value === "faceit" ? "1500" : "10000");
    setRedTrust(false);
    setError("");
  }
  function focusCalculator(groupId: "calculator-platform" | "calculator-method") {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("calculator")?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
    requestAnimationFrame(() => {
      const group = document.getElementById(groupId);
      group?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
      if (!reduced) group?.animate([{ boxShadow: "0 0 0 0 #f59b2300" }, { boxShadow: "0 0 0 3px #f59b2380", offset: .45 }, { boxShadow: "0 0 0 0 #f59b2300" }], { duration: 1600, easing: "ease-out" });
    });
  }
  function configureService(value: Platform, nextService: Service) {
    changePlatform(value);
    setService(nextService);
    setError("");
    focusCalculator("calculator-platform");
  }
  function next(){
    const start=Number(current),end=Number(target);
    if(service==="rating"&&(!current||!target||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>100000)){setError(t.invalid);return}
    setError("");
    if(!price){setError(lang==="ru"?"Проверьте рейтинг и промокод.":"Check the ratings and promo code.");return}
    if(!writeStorage("sessionStorage","cs2-draft",JSON.stringify({platform,service,method,current:service==="rating"?start:null,target:service==="rating"?end:null,redTrust:platform==="premier"&&redTrust,promoCode:price.promoCode}))){setError(lang==="ru"?"Разрешите хранение данных в браузере, чтобы продолжить оформление.":"Allow browser storage to continue your request.");return}
    window.location.assign("/register");
  }
  return <div className="site tactical-home">
    <MarketingHeader lang={lang}/>
    <main>
      <section className="tactical-hero">
        <div className="arena-backdrop"><Image src="/hero-arena.png" alt="" fill sizes="100vw" priority/></div>
        <div className="hero-scan" aria-hidden="true"/>
        <div className="wrap tactical-hero-inner">
          <div className="hero-copy"><span className="eyebrow">COMPETITIVE SERVICES <i>{"// 01"}</i></span><h1>{t.title1}<em>{t.title2}</em></h1><p>{t.intro}</p><div className="hero-actions"><a className="tactical-primary" href="#calculator">{lang === "ru" ? "Рассчитать стоимость" : "Calculate your price"}<ArrowUpRight size={20}/></a><a className="hero-secondary" href="#process">{t.process}<ArrowRight size={16}/></a></div><div className="hero-platforms"><span><i/>{lang === "ru" ? "ЦЕНА ДО ОПЛАТЫ" : "PRICE BEFORE PAYMENT"}</span><span><i/>{lang === "ru" ? "DUO БЕЗ ПЕРЕДАЧИ АККАУНТА" : "DUO WITHOUT ACCOUNT SHARING"}</span><span><i/>{lang === "ru" ? "ЧАТ ЗАКАЗА" : "ORDER CHAT"}</span></div></div>
          <ObjectiveHud platform={platform} current={service === "rating" ? current : ""} target={service === "rating" ? target : ""} method={method} price={price} ru={lang === "ru"} calibration={service === "calibration"}/>
          <div className="hero-bottom"><a href="#calculator"><ArrowDown size={15}/>{lang === "ru" ? "НАСТРОЙТЕ СВОЙ ЗАКАЗ" : "CONFIGURE YOUR ORDER"}</a><span>{"MAP // ARENA"} <i>{"QUEUE // "}{platform.toUpperCase()}</i></span></div>
        </div>
      </section>
      <div className="trust-strip"><div className="wrap"><span><ShieldCheck size={16}/>{lang === "ru" ? "Изменения — с вашего согласия" : "Changes need your approval"}</span><span><MessageSquare size={16}/>{lang === "ru" ? "История заказа в кабинете" : "Order history in your account"}</span><span><UsersRound size={16}/>{lang === "ru" ? "Формат игры на ваш выбор" : "Choose how you play"}</span><span><LockKeyhole size={16}/>{lang === "ru" ? "Данные отдельно от чата" : "Access details outside chat"}</span></div></div>
      <section className="tactical-section configure-section" id="calculator"><div className="wrap configure-wrap">
        <div className="section-heading"><div><span className="kicker">01 // CONFIGURE</span><h2>{t.configTitle}</h2></div><div className="configure-steps"><span className="current"><b>01</b>{t.platform}</span><i/><span><b>02</b>{lang === "ru" ? "Цель" : "Target"}</span><i/><span><b>03</b>{lang === "ru" ? "Заказ" : "Order"}</span></div></div>
        <div className="order-configurator">
          <div className="configuration-fields">
            <div className="config-section-label"><span>01 / {t.platform.toUpperCase()}</span><span>PREMIER / FACEIT</span></div>
            <div className="platform-selector" id="calculator-platform" role="group" aria-label={t.platform}><button type="button" className={platform === "premier" ? "platform-card selected" : "platform-card"} aria-pressed={platform === "premier"} onClick={()=>changePlatform("premier")}><span className="platform-symbol"><Crosshair size={28}/></span><span><strong>PREMIER</strong><small>CS2 MATCHMAKING</small></span><span className="selection-square">{platform === "premier" && <Check size={12}/>}</span></button><button type="button" className={platform === "faceit" ? "platform-card selected" : "platform-card"} aria-pressed={platform === "faceit"} onClick={()=>changePlatform("faceit")}><span className="platform-symbol faceit-symbol"><ArrowUpRight size={30}/></span><span><strong>FACEIT</strong><small>ELO BOOST</small></span><span className="selection-square">{platform === "faceit" && <Check size={12}/>}</span></button></div>
            <div className="config-options"><div><span className="config-label">{t.service}</span><div className="tactical-toggle" role="group" aria-label={t.service}><button type="button" aria-pressed={service === "rating"} className={service === "rating" ? "selected" : ""} onClick={()=>{setService("rating");setError("")}}>{t.rating}</button><button type="button" aria-pressed={service === "calibration"} className={service === "calibration" ? "selected" : ""} onClick={()=>{setService("calibration");setError("")}}>{t.calibration}</button></div></div><div><span className="config-label">{t.method}</span><div className="tactical-toggle" id="calculator-method" role="group" aria-label={t.method}><button type="button" aria-pressed={method === "duo"} className={method === "duo" ? "selected" : ""} onClick={()=>setMethod("duo")}><UsersRound size={15}/>DUO</button><button type="button" aria-pressed={method === "piloted"} className={method === "piloted" ? "selected" : ""} onClick={()=>setMethod("piloted")}><LockKeyhole size={15}/>PILOTED</button></div></div></div>
            <div className="config-section-label"><span>02 / {lang === "ru" ? "ВАША ЦЕЛЬ" : "YOUR TARGET"}</span><span>{service === "rating" ? (platform === "premier" ? "RATING" : "ELO") : "CALIBRATION"}</span></div>
            {service === "rating" ? <div className="rating-modules"><RatingControl id="current" label={t.current} value={current} onChange={setCurrent} platform={platform} ru={lang === "ru"}/><RatingControl id="target" label={t.target} value={target} onChange={setTarget} platform={platform} target ru={lang === "ru"}/></div> : <div className="calibration-module"><Crosshair size={32}/><div><h3>{lang === "ru" ? "Начните с калибровки" : "Start with calibration"}</h3><p>{t.calibrationHint}</p></div></div>}
            {platform === "premier" && <label className={`trust-check${redTrust ? " active" : ""}`}><input type="checkbox" checked={redTrust} onChange={event=>setRedTrust(event.target.checked)}/><span>{lang === "ru" ? "На аккаунте красный траст" : "Red trust on this account"}</span><b>+10%</b></label>}
            {service === "rating" && <><div className="config-tariff"><span>{lang === "ru" ? "БАЗОВЫЙ ТАРИФ" : "BASE RATE"}</span><strong>{price?.rate ?? (Number(current) > (platform === "premier" ? 10000 : 1200) ? 700 : 500)} ₽ <small>/ {platform === "premier" ? (lang === "ru" ? "1 000 рейтинга" : "1,000 rating") : "100 ELO"}</small></strong></div>
            <p className="tariff-note">{platform === "premier" ? (lang === "ru" ? "Выше 10 000 на старте — 700 ₽ за 1 000 рейтинга." : "Starting above 10,000: 700 RUB per 1,000 rating.") : (lang === "ru" ? "Выше 1 200 ELO на старте — 700 ₽ за 100 ELO." : "Starting above 1,200: 700 RUB per 100 ELO.")} {lang === "ru" ? "Неполный шаг — пропорционально, срок округляется до дня." : "Partial steps are priced proportionally; time rounds up to a day."}</p></>}
          </div>
          <aside className="configuration-summary"><div className="summary-heading"><span>{lang === "ru" ? "ВАШ ЗАКАЗ" : "YOUR ORDER"}</span><span>03 / CONFIRM</span></div><div className="summary-mode"><strong>{platform.toUpperCase()}</strong><span>{service === "calibration" ? t.calibration : method.toUpperCase()}</span></div>
            {service === "rating" ? <><div className="summary-route"><span>{current ? <AnimatedNumber value={Number(current)} ru={lang === "ru"}/> : "—"}</span><ArrowRight size={22}/><strong>{target ? <AnimatedNumber value={Number(target)} ru={lang === "ru"}/> : "—"}</strong></div><div className="summary-delta">{price?.durationDays ? `+${new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US").format(Number(target) - Number(current))} ${platform === "premier" ? (lang === "ru" ? "рейтинга" : "rating") : "ELO"}` : (lang === "ru" ? "Укажите корректную цель" : "Set a valid target")}</div></> : <div className="summary-calibration">UNRANKED<ArrowUpRight size={22}/></div>}
            <PriceSummary price={price} ru={lang === "ru"} problem={priceProblem}/>
            <PromoInput value={promoCode} onChange={value=>{setPromoCode(value);writeStorage("sessionStorage","cs2-promo",value)}} ru={lang === "ru"}/>
            {error&&<p className="error" role="alert">{error}</p>}
            <Button className="continue-button tactical-primary" onClick={next} disabled={!price}>{t.continue}<ArrowUpRight size={19}/></Button><p className="under-button">{signedIn?(lang==="ru"?"Заказ сохранится в вашем кабинете":"Saved to your account"):t.accountLater}</p><div className="summary-assurance"><ShieldCheck size={14}/>{lang === "ru" ? "Оплата после принятия заявки" : "Pay after your request is accepted"}</div>
          </aside>
        </div>
      </div></section>
      <section className="tactical-section services-section" id="services"><div className="wrap">
        <div className="section-heading"><div><span className="kicker">02 // MATCH SERVICES</span><h2>{lang === "ru" ? "Каждая цель — свой маршрут." : "Every goal. Its own route."}</h2></div><p>{lang === "ru" ? "Выберите услугу — её параметры сразу появятся в калькуляторе." : "Choose a service to load its settings straight into the calculator."}</p></div>
        <div className="service-modules">{serviceSlugs.map((slug,index) => {
          const item = services[lang][slug];
          return <article className={`service-module service-module-${index}`} key={slug}>
            <div className="service-module-top"><span>0{index+1}</span><span>{index === 0 ? "MATCHMAKING" : index === 1 ? "COMPETITIVE" : "NEW START"}</span><ArrowUpRight size={20}/></div>
            <h3>{item.label}</h3><p>{index === 0 ? (lang === "ru" ? "Рейтинг Premier до выбранной цели." : "Premier rating towards your chosen target.") : index === 1 ? (lang === "ru" ? "Следующий шаг в вашем ELO." : "Your next step in ELO.") : (lang === "ru" ? "Первые матчи. Начало вашего пути." : "First matches. Your starting point.")}</p>
            <ServiceObjective index={index} ru={lang === "ru"}/>
            <div className="service-rate">{index < 2 ? <><strong>500 ₽</strong><span>/ {index === 0 ? (lang === "ru" ? "1 000 рейтинга" : "1,000 rating") : "100 ELO"}</span></> : <strong>{lang === "ru" ? "По согласованию" : "By agreement"}</strong>}</div>
            <div className="module-actions"><button type="button" className="module-configure" aria-label={`${lang === "ru" ? "Настроить" : "Configure"} ${item.label}`} onClick={() => configureService(item.service === "calibration" ? platform : item.platform, item.service)}>{lang === "ru" ? "Настроить" : "Configure"}<ArrowUpRight size={17}/></button><a className="module-link" href={`/${lang}/${slug}`}>{commonCopy[lang].more}<ArrowRight size={14}/></a></div>
          </article>;
        })}</div>
      </div></section>
      <PlayingMethods lang={lang} selected={method} onSelect={value => { setMethod(value); focusCalculator("calculator-method"); }}/>
      <AccountShowcase lang={lang}/>
      <SecuritySection lang={lang}/>
      <section className="tactical-section faq-section" id="faq"><div className="wrap faq-layout"><div className="faq-help"><span className="kicker">07 // INTEL</span><h2>{lang === "ru" ? "До начала матча." : "Before the first match."}</h2><p>{lang === "ru" ? "Коротко о цене, заказе и формате игры. Остальное обсудим в чате." : "Price, order and playing method. We can discuss the rest in chat."}</p><a href="/support"><MessageSquare size={16}/>{lang === "ru" ? "Спросить администратора" : "Ask an admin"}<ArrowUpRight size={16}/></a></div><HomeFaq lang={lang} orderQuestions={[{question:t.q1,answer:t.a1},{question:t.q2,answer:t.a2},{question:t.q3,answer:t.a3},...commonCopy[lang].questions]}/></div></section>
    </main>
    <MarketingFooter lang={lang}/>
  </div>;
}
