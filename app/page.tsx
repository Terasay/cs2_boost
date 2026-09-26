/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Crosshair, Menu, MessageSquare, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Lang = "ru" | "en";
type Platform = "premier" | "faceit";
type Service = "rating" | "calibration";
type Method = "duo" | "piloted";

const words = {
  ru: {
    services:"Услуги", process:"Как это работает", faq:"Вопросы", login:"Войти", eyebrow:"CS2 / PREMIER / FACEIT",
    title1:"Выберите цель.",title2:"Остальное — за нами.",intro:"Буст рейтинга и калибровка в CS2. Настройте заказ и получите подтверждённую цену и срок до оплаты.",
    benefit1:"Premier и FACEIT",benefit2:"Чат с администратором",config:"НАСТРОЙКА ЗАКАЗА",configTitle:"Ваш маршрут к рейтингу",
    platform:"Площадка",service:"Услуга",rating:"Буст рейтинга",calibration:"Калибровка",method:"Способ выполнения",duo:"Игра вместе",piloted:"На вашем аккаунте",
    current:"Текущий рейтинг",target:"Желаемый рейтинг",calibrationHint:"Условия калибровки уточним после заявки.",
    quote:"Стоимость и срок",quoteValue:"Индивидуальный расчёт",quoteHint:"Администратор предложит цену и дату завершения. Вы подтвердите условия до оплаты.",
    continue:"Продолжить оформление",accountLater:"Аккаунт создаётся на следующем шаге",invalid:"Укажите текущий и желаемый рейтинг. Цель должна быть выше текущего.",
    serviceTitle:"Под ваш формат игры",s1:"Буст рейтинга",s1d:"Выберите Premier или FACEIT и укажите свой целевой рейтинг.",s2:"Калибровка",s2d:"Согласуем цель и условия перед началом матчей.",s3:"Два способа",s3d:"Играйте вместе с исполнителем или выберите выполнение на аккаунте.",
    processTitle:"Три шага до заказа",p1:"Задайте цель",p1d:"Выберите площадку, услугу и желаемый результат.",p2:"Согласуйте условия",p2d:"Администратор подтвердит цену и срок.",p3:"Следите за работой",p3d:"Статус заказа и чат доступны в личном кабинете.",
    faqTitle:"Перед оформлением",q1:"Когда будет известна цена?",a1:"После заявки администратор рассчитает стоимость по вашим параметрам. Вы увидите её до оплаты.",q2:"Нужно ли создавать аккаунт сразу?",a2:"Нет. Сначала выберите параметры, затем создайте аккаунт для оформления заказа.",q3:"Можно ли играть вместе с исполнителем?",a3:"Да, выберите «Игра вместе» в форме заказа.",
    footer:"Первая версия сервиса. Цены и сроки подтверждаются индивидуально."
  },
  en: {
    services:"Services",process:"How it works",faq:"FAQ",login:"Sign in",eyebrow:"CS2 / PREMIER / FACEIT",
    title1:"Choose your goal.",title2:"We'll handle the climb.",intro:"CS2 rating boosts and calibration. Configure your request and receive a confirmed price and deadline before paying.",
    benefit1:"Premier and FACEIT",benefit2:"Direct admin chat",config:"CONFIGURE YOUR ORDER",configTitle:"Your route to the next rank",
    platform:"Platform",service:"Service",rating:"Rating boost",calibration:"Calibration",method:"Boost method",duo:"Play together",piloted:"On your account",
    current:"Current rating",target:"Target rating",calibrationHint:"We'll confirm calibration details after your request.",
    quote:"Price and deadline",quoteValue:"Personal quote",quoteHint:"An admin will offer a price and completion date. You accept the terms before paying.",
    continue:"Continue to order",accountLater:"Create an account in the next step",invalid:"Enter your current and target rating. The target must be higher.",
    serviceTitle:"Your game, your format",s1:"Rating boost",s1d:"Choose Premier or FACEIT and set your target rating.",s2:"Calibration",s2d:"Agree on the goal and terms before matches start.",s3:"Two methods",s3d:"Play with the booster or arrange a piloted order.",
    processTitle:"Three steps to order",p1:"Set your goal",p1d:"Choose the platform, service and target.",p2:"Agree on terms",p2d:"An admin confirms the price and deadline.",p3:"Track progress",p3d:"Order status and chat are available in your account.",
    faqTitle:"Before you order",q1:"When will I know the price?",a1:"An admin will price your request after reviewing the details. You see the quote before paying.",q2:"Do I need an account right away?",a2:"No. Configure your request first, then create an account to submit it.",q3:"Can I play with the booster?",a3:"Yes. Choose “Play together” in the order form.",
    footer:"First version of the service. Prices and deadlines are confirmed individually."
  }
};

export default function Home() {
  const [lang,setLang]=useState<Lang>("ru");
  const [platform,setPlatform]=useState<Platform>("premier");
  const [service,setService]=useState<Service>("rating");
  const [method,setMethod]=useState<Method>("duo");
  const [current,setCurrent]=useState("");
  const [target,setTarget]=useState("");
  const [error,setError]=useState("");
  const [menu,setMenu]=useState(false);
  const t=words[lang];
  useEffect(()=>{const saved=localStorage.getItem("cs2-lang");if(saved==="ru"||saved==="en"){setLang(saved);document.documentElement.lang=saved}},[]);
  useEffect(()=>{
    type Context = { registerTool: (tool: { name:string; title:string; description:string; inputSchema:object; annotations:{readOnlyHint:boolean}; execute:(input:unknown)=>Promise<unknown> }, options:{signal:AbortSignal})=>void|Promise<void> };
    const context=(document as Document & {modelContext?:Context}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    void Promise.resolve(context.registerTool({
      name:"configure_boost_request",
      title:"Configure CS2 boost request",
      description:"Set the visible Premier or FACEIT request form. This stages a request; it does not create an order.",
      inputSchema:{type:"object",properties:{platform:{type:"string",enum:["premier","faceit"]},service:{type:"string",enum:["rating","calibration"]},method:{type:"string",enum:["duo","piloted"]},current:{type:"integer",minimum:0},target:{type:"integer",minimum:1}},required:["platform","service","method"],additionalProperties:false},
      annotations:{readOnlyHint:false},
      async execute(input){
        const value=input as Record<string,unknown>;
        if((value.platform!=="premier"&&value.platform!=="faceit")||(value.service!=="rating"&&value.service!=="calibration")||(value.method!=="duo"&&value.method!=="piloted"))throw new Error("Invalid request options");
        if(value.service==="rating"&&(!Number.isInteger(value.current)||!Number.isInteger(value.target)||Number(value.current)<0||Number(value.target)<=Number(value.current)))throw new Error("Valid current and target ratings are required");
        setPlatform(value.platform);setService(value.service);setMethod(value.method);
        setCurrent(value.service==="rating"?String(value.current):"");setTarget(value.service==="rating"?String(value.target):"");setError("");
        document.getElementById("calculator")?.scrollIntoView({behavior:"smooth",block:"start"});
        return {staged:true,platform:value.platform,service:value.service,method:value.method,current:value.service==="rating"?value.current:null,target:value.service==="rating"?value.target:null};
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  function setLanguage(value:Lang){setLang(value);localStorage.setItem("cs2-lang",value);document.documentElement.lang=value}
  function next(){
    const start=Number(current),end=Number(target);
    if(service==="rating"&&(!current||!target||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)){setError(t.invalid);return}
    setError("");
    sessionStorage.setItem("cs2-draft",JSON.stringify({platform,service,method,current:service==="rating"?start:null,target:service==="rating"?end:null}));
    window.location.assign("/register");
  }
  return <div className="site">
    <div className="topbar"><span>COUNTER-STRIKE 2</span><span>PREMIER / FACEIT</span></div>
    <header className="header wrap">
      <a href="/" className="brand"><span className="brand-mark"><Crosshair size={22}/></span>CS2<span>BOOST</span></a>
      <nav className={menu?"nav open":"nav"}><a href="#services" onClick={()=>setMenu(false)}>{t.services}</a><a href="#process" onClick={()=>setMenu(false)}>{t.process}</a><a href="#faq" onClick={()=>setMenu(false)}>{t.faq}</a></nav>
      <div className="header-actions"><div className="language"><button className={lang==="ru"?"active":""} onClick={()=>setLanguage("ru")}>RU</button><span>/</span><button className={lang==="en"?"active":""} onClick={()=>setLanguage("en")}>EN</button></div><a href="/login" className="login-link">{t.login} <ArrowRight size={16}/></a><button className="menu-button" aria-label={menu?"Close menu":"Open menu"} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div>
    </header>
    <main>
      <section className="hero wrap">
        <div className="hero-copy"><span className="eyebrow">{t.eyebrow}</span><h1>{t.title1}<br/><em>{t.title2}</em></h1><p>{t.intro}</p><div className="hero-points"><span><Crosshair size={18}/>{t.benefit1}</span><span><MessageSquare size={18}/>{t.benefit2}</span></div><div className="radar" aria-hidden="true"><i/><i/><i/><b>+</b></div></div>
        <div className="quote-card" id="calculator">
          <div className="quote-heading"><div><span className="kicker">{t.config}</span><h2>{t.configTitle}</h2></div><small>01 / 03</small></div>
          <div className="quote-body">
            <div className="field"><label>{t.platform}</label><div className="segments"><button className={platform==="premier"?"selected":""} onClick={()=>setPlatform("premier")}>PREMIER</button><button className={platform==="faceit"?"selected":""} onClick={()=>setPlatform("faceit")}>FACEIT</button></div></div>
            <div className="field"><label htmlFor="service">{t.service}</label><Select value={service} onValueChange={value=>setService(value as Service)}><SelectTrigger id="service" className="select-control"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rating">{t.rating}</SelectItem><SelectItem value="calibration">{t.calibration}</SelectItem></SelectContent></Select></div>
            <div className="field"><label>{t.method}</label><RadioGroup className="methods" value={method} onValueChange={value=>setMethod(value as Method)}><label className={method==="duo"?"selected":""}><RadioGroupItem value="duo"/>{t.duo}</label><label className={method==="piloted"?"selected":""}><RadioGroupItem value="piloted"/>{t.piloted}</label></RadioGroup></div>
            {service==="rating"?<div className="rating-row"><div className="field"><label htmlFor="current">{t.current}</label><Input id="current" type="number" min="0" inputMode="numeric" value={current} onChange={event=>setCurrent(event.target.value)} placeholder="4 500" className="rating-control"/></div><div className="field"><label htmlFor="target">{t.target}</label><Input id="target" type="number" min="1" inputMode="numeric" value={target} onChange={event=>setTarget(event.target.value)} placeholder="10 000" className="rating-control"/></div></div>:<p className="calibration-hint">{t.calibrationHint}</p>}
            <div className="estimate"><div><span>{t.quote}</span><strong>{t.quoteValue}</strong></div><p>{t.quoteHint}</p></div>
            {error&&<p className="error" role="alert">{error}</p>}
            <Button className="continue-button" onClick={next}>{t.continue}<ArrowRight size={19}/></Button><p className="under-button">{t.accountLater}</p>
          </div>
        </div>
      </section>
      <section className="content-block alt" id="services"><div className="wrap"><span className="kicker">{t.services.toUpperCase()}</span><h2>{t.serviceTitle}</h2><div className="cards"><article><span>01</span><Crosshair/><h3>{t.s1}</h3><p>{t.s1d}</p></article><article><span>02</span><ShieldCheck/><h3>{t.s2}</h3><p>{t.s2d}</p></article><article><span>03</span><MessageSquare/><h3>{t.s3}</h3><p>{t.s3d}</p></article></div></div></section>
      <section className="content-block" id="process"><div className="wrap"><span className="kicker">{t.process.toUpperCase()}</span><h2>{t.processTitle}</h2><div className="steps"><div><strong>01</strong><h3>{t.p1}</h3><p>{t.p1d}</p></div><div><strong>02</strong><h3>{t.p2}</h3><p>{t.p2d}</p></div><div><strong>03</strong><h3>{t.p3}</h3><p>{t.p3d}</p></div></div></div></section>
      <section className="content-block alt" id="faq"><div className="wrap faq-layout"><div><span className="kicker">FAQ</span><h2>{t.faqTitle}</h2></div><div className="faq-list"><details><summary>{t.q1}</summary><p>{t.a1}</p></details><details><summary>{t.q2}</summary><p>{t.a2}</p></details><details><summary>{t.q3}</summary><p>{t.a3}</p></details></div></div></section>
    </main>
    <footer><div className="wrap"><strong>CS2<span>BOOST</span></strong><p>{t.footer}</p><a href="#calculator">↑ TOP</a></div></footer>
  </div>;
}
