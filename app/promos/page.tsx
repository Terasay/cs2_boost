"use client";

import { useEffect, useState } from "react";
import { TicketPercent } from "lucide-react";
import { AccountShell, useLanguage } from "../account-ui";
import { useLiveResource } from "../use-live-resource";
import { Pagination, WorkspaceNav } from "../workspace-ui";
import { LinkCopy } from "../link-copy";
import { money } from "@/lib/pricing.mjs";

type Report = { codes: { code: string; requests: number; paidOrders: number; revenue: number; earned: number; reversed: number }[]; earnings: { orderId: string; promoCode: string; email: string; paidAmount: number; amount: number; createdAt: number; reversedAt: number | null }[]; page: number; pages: number; total: number };

export default function Promos() {
  const lang=useLanguage(); const ru=lang === "ru";
  const [page,setPage]=useState(1); const [origin,setOrigin]=useState("");
  const resource=useLiveResource<Report>(`/api/promos?page=${page}`,15000,false,"/dashboard");
  useEffect(()=>{const timer=setTimeout(()=>setOrigin(window.location.origin),0);return()=>clearTimeout(timer)},[]);
  return <AccountShell workspace><WorkspaceNav active="promos" ru={ru}/><header className="board-heading"><div><span className="kicker">ADMIN / PROMO</span><h1>{ru ? "Промокоды и начисления" : "Promo codes and earnings"}</h1><p>{ru ? "Клиенту −20%. Владельцу — 20% от подтверждённой оплаты." : "20% off for the client. The owner earns 20% of confirmed payments."}</p></div></header>
    {resource.error && <p className="error" role="alert">{resource.error}</p>}
    {!resource.data ? <p>{ru ? "Загрузка…" : "Loading…"}</p> : <><div className="promo-owner-grid">{resource.data.codes.map(code=><section key={code.code} className="promo-owner-card"><div className="promo-owner-title"><TicketPercent size={23}/><h2>{code.code}</h2><span>−20%</span></div><dl><div><dt>{ru ? "Заявок с кодом" : "Requests with code"}</dt><dd>{code.requests}</dd></div><div><dt>{ru ? "Оплаченных заказов" : "Paid orders"}</dt><dd>{code.paidOrders}</dd></div><div><dt>{ru ? "Подтверждённая выручка" : "Confirmed revenue"}</dt><dd>{money(code.revenue,lang)}</dd></div><div className="promo-earned"><dt>{ru ? "Начислено владельцу" : "Owner earnings"}</dt><dd>{money(code.earned,lang)}</dd></div>{code.reversed>0 && <div><dt>{ru ? "Отменено при возвратах" : "Reversed after refunds"}</dt><dd>{money(code.reversed,lang)}</dd></div>}</dl><LinkCopy value={origin ? `${origin}/${lang}?promo=${code.code}#calculator` : ""} label={ru ? "Ссылка с промокодом" : "Promo link"} ru={ru}/></section>)}</div><p className="inspector-note">{ru ? "Это учёт долей проекта. Перевод денег владельцам выполняется отдельно. При полном возврате клиенту начисление снимается." : "This records project shares. Transfers to the owners are handled separately. A full refund reverses the earning."}</p><section className="orders-board"><div className="promo-ledger-heading"><h2>{ru ? "История начислений" : "Earnings history"}</h2></div><div className="orders-table-scroll"><table className="promo-ledger"><thead><tr>{(ru ? ["Заказ / клиент","Промокод","Оплачено","Доля владельца","Дата"] : ["Order / client","Code","Paid","Owner share","Date"]).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{resource.data.earnings.map(item=><tr key={item.orderId}><td><a className="order-id-link" href={`/orders/${item.orderId}`}>#{item.orderId.slice(0,8).toUpperCase()}</a><small>{item.email}</small></td><td>{item.promoCode}</td><td>{money(item.paidAmount,lang)}</td><td className={item.reversedAt ? "promo-reversed" : "promo-valid"}>{money(item.amount,lang)}{item.reversedAt && <small>{ru ? "Возврат" : "Refund"}</small>}</td><td>{new Date(item.createdAt).toLocaleDateString(ru ? "ru-RU" : "en-US")}</td></tr>)}</tbody></table></div>{!resource.data.earnings.length && <div className="list-placeholder">{ru ? "Начисления появятся после подтверждения первой оплаты с промокодом." : "Earnings appear after the first payment with a promo code is confirmed."}</div>}<Pagination page={resource.data.page} pages={resource.data.pages} total={resource.data.total} busy={resource.loading} onPage={setPage} ru={ru}/></section></>}
  </AccountShell>;
}
