"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountShell, api, describeOrder, statusLabels, useLanguage } from "../../account-ui";

type Order = { id:string;userId:string;clientEmail:string;platform:string;service:string;method:string;currentRating:number|null;targetRating:number|null;status:string;quotedPrice:number|null;quotedCurrency:string|null;deadline:string|null;createdAt:number };
type Message = { id:string;senderId:string;body:string;createdAt:number };
type Detail = { order:Order; messages:Message[]; currentUserId:string; role:"client"|"admin" };

export default function OrderDetail() {
  const params=useParams();
  const id=String(params.id);
  const lang=useLanguage();
  const [data,setData]=useState<Detail|null>(null);
  const [body,setBody]=useState("");
  const [price,setPrice]=useState("");
  const [deadline,setDeadline]=useState("");
  const [status,setStatus]=useState("new");
  const [error,setError]=useState("");
  const [sending,setSending]=useState(false);
  const load=useCallback(async()=>{try{const result=await api<Detail>(`/api/orders/${id}`);setData(result);setPrice(result.order.quotedPrice?.toString()??"");setDeadline(result.order.deadline??"");setStatus(result.order.status)}catch(reason){setError(reason instanceof Error?reason.message:"Error")}},[id]);
  useEffect(()=>{const initial=setTimeout(load,0);const timer=setInterval(load,15000);return()=>{clearTimeout(initial);clearInterval(timer)}},[load]);
  async function send(event:React.FormEvent){event.preventDefault();if(!body.trim())return;setSending(true);setError("");try{await api(`/api/orders/${id}/messages`,{method:"POST",body:JSON.stringify({body})});setBody("");await load()}catch(reason){setError(reason instanceof Error?reason.message:"Error")}finally{setSending(false)}}
  async function save(){setError("");try{await api(`/api/orders/${id}`,{method:"PATCH",body:JSON.stringify({status,quotedPrice:price,deadline})});await load()}catch(reason){setError(reason instanceof Error?reason.message:"Error")}}
  async function accept(){setError("");try{await api(`/api/orders/${id}`,{method:"PATCH",body:JSON.stringify({action:"accept"})});await load()}catch(reason){setError(reason instanceof Error?reason.message:"Error")}}
  const order=data?.order;
  return <AccountShell back="/dashboard" backLabel={lang==="ru"?"Все заказы":"All orders"}><div className="account-intro"><span className="kicker">{lang==="ru"?"ЗАКАЗ":"ORDER"} #{id.slice(0,8).toUpperCase()}</span><h1>{lang==="ru"?"Детали заказа":"Order details"}</h1><p>{order?describeOrder(order,lang):(lang==="ru"?"Загружаем…":"Loading…")}</p></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {order&&<div className="order-layout"><div className="order-column">
      <section className="account-panel"><div className="panel-title"><h2>{lang==="ru"?"Условия":"Terms"}</h2><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang]??order.status}</span></div><dl className="summary-list"><div><dt>{lang==="ru"?"Клиент":"Client"}</dt><dd>{order.clientEmail}</dd></div><div><dt>{lang==="ru"?"Площадка":"Platform"}</dt><dd>{order.platform.toUpperCase()}</dd></div><div><dt>{lang==="ru"?"Способ":"Method"}</dt><dd>{order.method==="duo"?(lang==="ru"?"Игра вместе":"Play together"):(lang==="ru"?"На аккаунте":"Piloted")}</dd></div>{order.service==="rating"&&<div><dt>{lang==="ru"?"Цель":"Target"}</dt><dd>{order.currentRating} → {order.targetRating}</dd></div>}<div><dt>{lang==="ru"?"Цена":"Price"}</dt><dd>{order.quotedPrice!==null?`${order.quotedPrice.toLocaleString(lang==="ru"?"ru-RU":"en-US")} ₸`:(lang==="ru"?"Ожидает расчёта":"Pending quote")}</dd></div><div><dt>{lang==="ru"?"Срок":"Deadline"}</dt><dd>{order.deadline??"—"}</dd></div></dl>{data?.role==="client"&&order.status==="quoted"&&<Button className="account-cta" onClick={accept}>{lang==="ru"?"Принять предложение":"Accept quote"}<ArrowRight size={18}/></Button>}</section>
      {data?.role==="admin"&&<section className="account-panel admin-panel"><h2>{lang==="ru"?"Управление заказом":"Manage order"}</h2><label htmlFor="status">{lang==="ru"?"Статус":"Status"}</label><Select value={status} onValueChange={setStatus}><SelectTrigger id="status" className="select-control"><SelectValue/></SelectTrigger><SelectContent>{Object.keys(statusLabels).map(key=><SelectItem key={key} value={key}>{statusLabels[key][lang]}</SelectItem>)}</SelectContent></Select><label htmlFor="price">{lang==="ru"?"Цена, ₸":"Price, KZT"}</label><Input id="price" type="number" min="0" value={price} onChange={event=>setPrice(event.target.value)}/><label htmlFor="deadline">{lang==="ru"?"Срок выполнения":"Deadline"}</label><Input id="deadline" type="date" value={deadline} onChange={event=>setDeadline(event.target.value)}/><Button className="account-cta" onClick={save}>{lang==="ru"?"Сохранить изменения":"Save changes"}</Button></section>}
    </div><section className="account-panel chat-panel"><div className="panel-title"><h2>{lang==="ru"?"Чат заказа":"Order chat"}</h2><small>{lang==="ru"?"Обновляется каждые 15 секунд":"Refreshes every 15 seconds"}</small></div><div className="messages">{data?.messages.length?data.messages.map(message=><div key={message.id} className={message.senderId===data.currentUserId?"message mine":"message"}><small>{message.senderId===data.currentUserId?(lang==="ru"?"Вы":"You"):(data.role==="admin"?(lang==="ru"?"Клиент":"Client"):(lang==="ru"?"Администратор":"Admin"))} · {new Date(message.createdAt).toLocaleString(lang==="ru"?"ru-RU":"en-US")}</small><p>{message.body}</p></div>):<p className="muted">{lang==="ru"?"Сообщений пока нет. Напишите администратору здесь.":"No messages yet. Start the conversation here."}</p>}</div><form onSubmit={send}><label htmlFor="message">{lang==="ru"?"Сообщение":"Message"}</label><Textarea id="message" value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} rows={3} placeholder={lang==="ru"?"Напишите сообщение…":"Write a message…"}/><p className="credential-note">{lang==="ru"?"Не отправляйте пароль Steam или код Steam Guard в чат.":"Do not send Steam passwords or Steam Guard codes in chat."}</p><Button className="account-cta" disabled={sending||!body.trim()}>{lang==="ru"?"Отправить":"Send"}<Send size={17}/></Button></form></section></div>}
  </AccountShell>;
}
