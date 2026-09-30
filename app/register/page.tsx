"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { writeStorage } from "@/lib/browser-storage";
import { readCampaign } from "@/lib/campaign-storage";
import { AccountShell, api, readDraft, Draft, User, useLanguage } from "../account-ui";

export default function Register() {
  const lang = useLanguage();
  const [draft,setDraft]=useState<Draft|null>(null);
  const [user,setUser]=useState<User|null>(null);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [accepted,setAccepted]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    const timer=setTimeout(()=>{setDraft(readDraft())},0);
    api<{user:User|null}>("/api/auth/me").then(data=>{setUser(data.user);setReady(true)}).catch(reason=>setError(reason instanceof Error?reason.message:"Error"));
    return()=>clearTimeout(timer);
  },[]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if(loading||!ready)return;
    if(!draft){window.location.assign(`/${lang}#calculator`);return}
    if(!accepted){setError(lang==="ru"?"Подтвердите ознакомление с рисками.":"Please acknowledge the risks.");return}
    setLoading(true);setError("");
    try{
      if(!user){const auth=await api<{user:User}>("/api/auth/register",{method:"POST",body:JSON.stringify({email,password})});setUser(auth.user);setPassword("")}
      const result=await api<{id:string}>("/api/orders",{method:"POST",body:JSON.stringify({...draft,riskAccepted:true,attribution:readCampaign()})});
      writeStorage("sessionStorage","cs2-draft",null);
      window.location.assign(`/orders/${result.id}`);
    }catch(reason){setError(reason instanceof Error?reason.message:"Error");setLoading(false)}
  }

  return <AccountShell><div className="account-intro"><span className="kicker">02 / 03</span><h1>{lang==="ru"?"Оформление заявки":"Complete your request"}</h1><p>{lang==="ru"?"Создайте аккаунт, чтобы сохранить заказ и общаться с администратором.":"Create an account to save your order and chat with an admin."}</p></div>
    <div className="account-grid"><div className="account-panel"><h2>{lang==="ru"?"Параметры заказа":"Order details"}</h2>{draft?<dl className="summary-list"><div><dt>{lang==="ru"?"Площадка":"Platform"}</dt><dd>{draft.platform.toUpperCase()}</dd></div><div><dt>{lang==="ru"?"Услуга":"Service"}</dt><dd>{draft.service==="rating"?(lang==="ru"?"Буст рейтинга":"Rating boost"):(lang==="ru"?"Калибровка":"Calibration")}</dd></div><div><dt>{lang==="ru"?"Способ":"Method"}</dt><dd>{draft.method==="duo"?(lang==="ru"?"Игра вместе":"Play together"):(lang==="ru"?"На аккаунте":"Piloted")}</dd></div>{draft.service==="rating"&&<div><dt>{lang==="ru"?"Рейтинг":"Rating"}</dt><dd>{draft.current} → {draft.target}</dd></div>}</dl>:<p>{lang==="ru"?"Параметры не выбраны. Вернитесь к форме на главной.":"No request settings found. Return to the main form."}</p>}<div className="summary-note">{lang==="ru"?"Стоимость и срок администратор подтвердит после заявки. Оплата на этом этапе не требуется.":"An admin will confirm the price and deadline. No payment is required now."}</div></div>
    <form className="account-panel" onSubmit={submit}><h2>{user?(lang==="ru"?"Подтвердите заявку":"Confirm request"):(lang==="ru"?"Создать аккаунт":"Create account")}</h2>{user?<p className="signed-as">{lang==="ru"?"Вы вошли как":"Signed in as"} <b>{user.email}</b></p>:<><label htmlFor="email">Email</label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="password">{lang==="ru"?"Пароль":"Password"}</label><Input id="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><small>{lang==="ru"?"Минимум 12 символов.":"At least 12 characters."}</small></>}
      <label className="risk-check"><Checkbox checked={accepted} onCheckedChange={value=>setAccepted(value===true)}/><span>{lang==="ru"?"Я понимаю, что буст может нарушать правила Steam и FACEIT и привести к ограничениям аккаунта.":"I understand that boosting may violate Steam and FACEIT rules and lead to account restrictions."}</span></label>
      <p className="credential-note">{lang==="ru"?"Не указывайте пароль Steam и код Steam Guard в этой форме или чате.":"Do not enter your Steam password or Steam Guard code here or in the chat."}</p>
      {user?.role==="admin"&&<p className="summary-note">{lang==="ru"?"Для оформления заказа войдите как клиент.":"Use a client account to place an order."}</p>}{error&&<p className="error" role="alert">{error}</p>}<Button type="submit" className="account-cta" disabled={loading||!ready||!draft||user?.role==="admin"}>{loading?(lang==="ru"?"Отправляем…":"Submitting…"):(lang==="ru"?"Отправить заявку":"Submit request")}<ArrowRight size={18}/></Button>{!user&&<p className="account-footnote">{lang==="ru"?"Уже есть аккаунт?":"Already have an account?"} <a href="/login">{lang==="ru"?"Войти":"Sign in"}</a></p>}</form></div></AccountShell>;
}
