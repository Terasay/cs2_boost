/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LogOut } from "lucide-react";
import { AccountShell, api, describeOrder, statusLabels, User, useLanguage } from "../account-ui";

type Order = { id:string;platform:string;service:string;method:string;currentRating:number|null;targetRating:number|null;status:string;createdAt:number;email:string };

export default function Dashboard() {
  const lang=useLanguage();
  const [user,setUser]=useState<User|null>(null);
  const [orders,setOrders]=useState<Order[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{(async()=>{try{const auth=await api<{user:User|null}>("/api/auth/me");if(!auth.user){window.location.assign("/login");return}setUser(auth.user);const result=await api<{orders:Order[]}>("/api/orders");setOrders(result.orders)}catch(reason){setError(reason instanceof Error?reason.message:"Error")}finally{setLoading(false)}})()},[]);
  async function logout(){await api("/api/auth/logout",{method:"POST"});window.location.assign("/")}
  return <AccountShell><div className="dashboard-heading"><div className="account-intro"><span className="kicker">{user?.role==="admin"?"ADMIN / CS2 BOOST":"MY ACCOUNT / CS2 BOOST"}</span><h1>{user?.role==="admin"?(lang==="ru"?"Заявки клиентов":"Client requests"):(lang==="ru"?"Мои заказы":"My orders")}</h1><p>{user?.email}</p></div><button className="text-action" onClick={logout}><LogOut size={17}/>{lang==="ru"?"Выйти":"Sign out"}</button></div>
  {loading?<p className="muted">{lang==="ru"?"Загружаем заказы…":"Loading orders…"}</p>:error?<p className="error" role="alert">{error}</p>:orders.length===0?<div className="empty-state"><h2>{lang==="ru"?"Заявок пока нет":"No requests yet"}</h2><p>{lang==="ru"?"Настройте первый заказ на главной странице.":"Configure your first request on the home page."}</p><a className="link-button" href="/#calculator">{lang==="ru"?"Создать заявку":"New request"}<ArrowRight size={17}/></a></div>:<div className="order-list">{orders.map(order=><a key={order.id} href={`/orders/${order.id}`} className="order-card"><div><div className="order-meta"><span>#{order.id.slice(0,8).toUpperCase()}</span><span>{new Date(order.createdAt).toLocaleDateString(lang==="ru"?"ru-RU":"en-US")}</span>{user?.role==="admin"&&<span>{order.email}</span>}</div><h2>{describeOrder(order,lang)}</h2></div><div className="order-trailing"><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang]??order.status}</span><ArrowRight size={19}/></div></a>)}</div>}
  </AccountShell>;
}
