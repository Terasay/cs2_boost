"use client";

import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "@/lib/browser-storage";
import { calculatePrice, type Price } from "@/lib/pricing.mjs";
import { PriceSummary, PromoInput } from "./price-summary";
import { api, readDraft } from "./account-ui";
import Image from "next/image";
import { ArrowRight, Crosshair, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { MarketingHeader, MarketingFooter, FaqList } from "./marketing-ui";
import { PlayingMethods, AccountShowcase } from "./home-showcase";
import { commonCopy, services, serviceSlugs, type Language as Lang } from "@/lib/marketing";
type Platform = "premier" | "faceit";
type Service = "rating" | "calibration";
type Method = "duo" | "piloted";

const words = {
  ru: {
    services:"Услуги", process:"Как это работает", faq:"Вопросы", login:"Войти", eyebrow:"CS2 / PREMIER / FACEIT",
    title1:"Буст CS2.",title2:"Premier и FACEIT.",intro:"Буст рейтинга и калибровка в CS2. Настройте заказ и получите подтверждённую цену и срок до оплаты.",
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
    title1:"CS2 Boost.",title2:"Premier & FACEIT.",intro:"CS2 rating boosts and calibration. Configure your request and receive a confirmed price and deadline before paying.",
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
  const [current,setCurrent]=useState("");
  const [target,setTarget]=useState("");
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
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const elements=document.querySelectorAll<HTMLElement>(".content-block h2,.cards article,.steps>div,.faq-layout>div");
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}}},{threshold:.12,rootMargin:"0px 0px -35px 0px"});
    elements.forEach(element=>{element.classList.add("scroll-reveal");observer.observe(element)});
    return()=>observer.disconnect();
  },[]);
  function next(){
    const start=Number(current),end=Number(target);
    if(service==="rating"&&(!current||!target||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>100000)){setError(t.invalid);return}
    setError("");
    if(!price){setError(lang==="ru"?"Проверьте рейтинг и промокод.":"Check the ratings and promo code.");return}
    if(!writeStorage("sessionStorage","cs2-draft",JSON.stringify({platform,service,method,current:service==="rating"?start:null,target:service==="rating"?end:null,redTrust:platform==="premier"&&redTrust,promoCode:price.promoCode}))){setError(lang==="ru"?"Разрешите хранение данных в браузере, чтобы продолжить оформление.":"Allow browser storage to continue your request.");return}
    window.location.assign("/register");
  }
  return <div className="site">
    <MarketingHeader lang={lang}/>
    <main>
      <section className="hero wrap">
        <div className="hero-copy"><span className="eyebrow">{t.eyebrow}</span><h1>{t.title1}<br/><em>{t.title2}</em></h1><p>{t.intro}</p><div className="hero-points"><span><Crosshair size={18}/>{t.benefit1}</span><span><MessageSquare size={18}/>{t.benefit2}</span></div><div className="hero-media"><Image src="/hero-arena.png" alt="" width={1536} height={1024} priority/></div></div>
        <div className="quote-card" id="calculator">
          <div className="quote-heading"><div><span className="kicker">{t.config}</span><h2>{t.configTitle}</h2></div><small>01 / 03</small></div>
          <div className="quote-body">
            <div className="field"><label>{t.platform}</label><div className="segments"><button className={platform==="premier"?"selected":""} onClick={()=>setPlatform("premier")}>PREMIER</button><button className={platform==="faceit"?"selected":""} onClick={()=>setPlatform("faceit")}>FACEIT</button></div></div>
            <div className="field"><label htmlFor="service">{t.service}</label><Select value={service} onValueChange={value=>setService(value as Service)}><SelectTrigger id="service" className="select-control"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rating">{t.rating}</SelectItem><SelectItem value="calibration">{t.calibration}</SelectItem></SelectContent></Select></div>
            <div className="field"><label>{t.method}</label><RadioGroup className="methods" value={method} onValueChange={value=>setMethod(value as Method)}><label className={method==="duo"?"selected":""}><RadioGroupItem value="duo"/>{t.duo}</label><label className={method==="piloted"?"selected":""}><RadioGroupItem value="piloted"/>{t.piloted}</label></RadioGroup></div>
            {service==="rating"?<div className="rating-row"><div className="field"><label htmlFor="current">{t.current}</label><Input id="current" type="number" min="0" inputMode="numeric" value={current} onChange={event=>setCurrent(event.target.value)} placeholder="4 500" className="rating-control"/></div><div className="field"><label htmlFor="target">{t.target}</label><Input id="target" type="number" min="1" inputMode="numeric" value={target} onChange={event=>setTarget(event.target.value)} placeholder="10 000" className="rating-control"/></div></div>:<p className="calibration-hint">{t.calibrationHint}</p>}
            {platform === "premier" && <label className="trust-check"><input type="checkbox" checked={redTrust} onChange={event=>setRedTrust(event.target.checked)}/><span>{lang === "ru" ? "На аккаунте красный траст · +10%" : "Red trust on this account · +10%"}</span></label>}
            <p className="tariff-note">{platform === "premier" ? (lang === "ru" ? "500 ₽ / 1 000 рейтинга. При исходном рейтинге выше 10 000 — 700 ₽." : "500 RUB / 1,000 rating. Starting above 10,000: 700 RUB.") : (lang === "ru" ? "500 ₽ / 100 ELO. При исходном ELO выше 1 200 — 700 ₽." : "500 RUB / 100 ELO. Starting above 1,200: 700 RUB.")}<br/>{lang === "ru" ? "Неполный шаг оплачивается пропорционально; срок округляется до целого дня." : "Partial steps are priced proportionally; delivery time rounds up to a whole day."}</p>
            <PromoInput value={promoCode} onChange={value=>{setPromoCode(value);writeStorage("sessionStorage","cs2-promo",value)}} ru={lang === "ru"}/>
            <PriceSummary price={price} ru={lang === "ru"} problem={priceProblem}/>
            {error&&<p className="error" role="alert">{error}</p>}
            <Button className="continue-button" onClick={next}>{t.continue}<ArrowRight size={19}/></Button><p className="under-button">{signedIn?(lang==="ru"?"Заявка сохранится в личном кабинете":"Your request will be saved in your account"):t.accountLater}</p>
          </div>
        </div>
      </section>
      <section className="content-block alt" id="services"><div className="wrap"><span className="kicker">{t.services.toUpperCase()}</span><h2>{t.serviceTitle}</h2><div className="cards">{serviceSlugs.map((slug,index)=><article key={slug}><span>0{index+1}</span><Crosshair/><h3>{services[lang][slug].heading}</h3><p>{services[lang][slug].intro}</p><a className="service-text-link" href={`/${lang}/${slug}`}>{commonCopy[lang].more}<ArrowRight size={16}/></a></article>)}</div></div></section>
      <PlayingMethods lang={lang} selected={method} onSelect={value => { setMethod(value); document.getElementById("calculator")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}/>
      <AccountShowcase lang={lang}/>
      <section className="content-block alt" id="faq"><div className="wrap faq-layout"><div><span className="kicker">FAQ</span><h2>{t.faqTitle}</h2></div><FaqList items={[{question:t.q1,answer:t.a1},{question:t.q2,answer:t.a2},{question:t.q3,answer:t.a3},...commonCopy[lang].questions]}/></div></section>
    </main>
    <MarketingFooter lang={lang}/>
  </div>;
}
