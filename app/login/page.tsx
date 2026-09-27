"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountShell, api, useLanguage } from "../account-ui";

export default function Login() {
  const lang=useLanguage();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:React.FormEvent){event.preventDefault();setLoading(true);setError("");try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});window.location.assign(sessionStorage.getItem("cs2-draft")?"/register":"/dashboard")}catch(reason){setError(reason instanceof Error?reason.message:"Error");setLoading(false)}}
  return <AccountShell><div className="login-layout"><div><div className="account-intro"><span className="kicker">CS2 BOOST</span><h1>{lang==="ru"?"Вход в аккаунт":"Sign in"}</h1><p>{lang==="ru"?"Вернитесь к заказам и переписке с администратором.":"Return to your orders and admin chat."}</p></div><form className="account-panel account-narrow" onSubmit={submit}><label htmlFor="email">Email</label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="password">{lang==="ru"?"Пароль":"Password"}</label><Input id="password" type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>{error&&<p className="error" role="alert">{error}</p>}<Button className="account-cta" disabled={loading}>{loading?"…":(lang==="ru"?"Войти":"Sign in")}<ArrowRight size={18}/></Button><p className="account-footnote">{lang==="ru"?"Нет аккаунта?":"No account?"} <a href="/#calculator">{lang==="ru"?"Начать с заказа":"Start a request"}</a></p></form></div><aside className="login-media"><Image src="/hero-arena.png" alt="" width={1536} height={1024} priority/><div className="login-media-caption"><span>PREMIER / FACEIT</span><strong>{lang==="ru"?"Заказы и чат в одном кабинете":"Orders and chat in one place"}</strong></div></aside></div></AccountShell>;
}
