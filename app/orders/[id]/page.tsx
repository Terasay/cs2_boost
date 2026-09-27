"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatHistory, type ChatPage } from "../../chat-history";
import { ApiError, AccountShell, api, describeOrder, statusLabels, useLanguage } from "../../account-ui";

type Order = { id:string;userId:string;clientEmail:string;platform:string;service:string;method:string;currentRating:number|null;targetRating:number|null;status:string;quotedPrice:number|null;quotedCurrency:string|null;deadline:string|null;createdAt:number;updatedAt:number };
type Detail = ChatPage & { order:Order; currentUserId:string; role:"client"|"admin" };

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
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [dirty,setDirty]=useState(false);
  const editing=useRef(false);
  const version=useRef(0);
  const latestRequest=useRef(0);
  const load=useCallback(async()=>{
    const request=++latestRequest.current;
    try {
      const result=await api<Detail>(`/api/orders/${id}`);
      if(request!==latestRequest.current)return;
      setData(result);
      if(!editing.current){setPrice(result.order.quotedPrice?.toString()??"");setDeadline(result.order.deadline??"");setStatus(result.order.status);version.current=result.order.updatedAt}
    } catch(reason){if(reason instanceof ApiError&&reason.status===401){window.location.assign("/login");return}setError(reason instanceof Error?reason.message:"Error")}
  },[id]);
  useEffect(()=>{const requests=latestRequest;const initial=setTimeout(load,0);const timer=setInterval(load,15000);return()=>{clearTimeout(initial);clearInterval(timer);requests.current++}},[load]);
  function markEdited(){editing.current=true;setDirty(true);setSaved(false)}
  async function send(event:React.FormEvent){event.preventDefault();if(sending||!body.trim())return;setSending(true);setError("");try{await api(`/api/orders/${id}/messages`,{method:"POST",body:JSON.stringify({body})});setBody("");await load()}catch(reason){setError(reason instanceof Error?reason.message:"Error")}finally{setSending(false)}}
  async function save(){if(saving)return;setSaving(true);setError("");setSaved(false);try{await api(`/api/orders/${id}`,{method:"PATCH",body:JSON.stringify({status,quotedPrice:price,deadline,updatedAt:version.current})});editing.current=false;setDirty(false);await load();setSaved(true)}catch(reason){setError(reason instanceof Error?reason.message:"Error");await load()}finally{setSaving(false)}}
  async function accept(){if(saving||!data)return;setSaving(true);setError("");try{await api(`/api/orders/${id}`,{method:"PATCH",body:JSON.stringify({action:"accept",updatedAt:data.order.updatedAt})});await load()}catch(reason){setError(reason instanceof Error?reason.message:"Error");await load()}finally{setSaving(false)}}
  const order=data?.order;
  return <AccountShell back="/dashboard" backLabel={lang==="ru"?"Все заказы":"All orders"}><div className="account-intro"><span className="kicker">{lang==="ru"?"ЗАКАЗ":"ORDER"} #{id.slice(0,8).toUpperCase()}</span><h1>{lang==="ru"?"Детали заказа":"Order details"}</h1><p>{order?describeOrder(order,lang):(lang==="ru"?"Загружаем…":"Loading…")}</p></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {order&&<div className="order-layout"><div className="order-column">
      <section className="account-panel"><div className="panel-title"><h2>{lang==="ru"?"Условия":"Terms"}</h2><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang]??order.status}</span></div><dl className="summary-list"><div><dt>{lang==="ru"?"Клиент":"Client"}</dt><dd>{order.clientEmail}</dd></div><div><dt>{lang==="ru"?"Площадка":"Platform"}</dt><dd>{order.platform.toUpperCase()}</dd></div><div><dt>{lang==="ru"?"Способ":"Method"}</dt><dd>{order.method==="duo"?(lang==="ru"?"Игра вместе":"Play together"):(lang==="ru"?"На аккаунте":"Piloted")}</dd></div>{order.service==="rating"&&<div><dt>{lang==="ru"?"Цель":"Target"}</dt><dd>{order.currentRating} → {order.targetRating}</dd></div>}<div><dt>{lang==="ru"?"Цена":"Price"}</dt><dd>{order.quotedPrice!==null?`${order.quotedPrice.toLocaleString(lang==="ru"?"ru-RU":"en-US")} ₸`:(lang==="ru"?"Ожидает расчёта":"Pending quote")}</dd></div><div><dt>{lang==="ru"?"Срок":"Deadline"}</dt><dd>{order.deadline??"—"}</dd></div></dl>{data?.role==="client"&&order.status==="quoted"&&<Button className="account-cta" onClick={accept} disabled={saving}>{lang==="ru"?"Принять предложение":"Accept quote"}<ArrowRight size={18}/></Button>}</section>
      {data?.role==="admin"&&<section className="account-panel admin-panel"><h2>{lang==="ru"?"Управление заказом":"Manage order"}</h2><label htmlFor="status">{lang==="ru"?"Статус":"Status"}</label><Select value={status} onValueChange={value=>{markEdited();setStatus(value)}}><SelectTrigger id="status" className="select-control"><SelectValue/></SelectTrigger><SelectContent>{Object.keys(statusLabels).map(key=><SelectItem key={key} value={key}>{statusLabels[key][lang]}</SelectItem>)}</SelectContent></Select><label htmlFor="price">{lang==="ru"?"Цена, ₸":"Price, KZT"}</label><Input id="price" type="number" min="0" value={price} onChange={event=>{markEdited();setPrice(event.target.value)}}/><label htmlFor="deadline">{lang==="ru"?"Срок выполнения":"Deadline"}</label><Input id="deadline" type="date" value={deadline} onChange={event=>{markEdited();setDeadline(event.target.value)}}/><Button className="account-cta" onClick={save} disabled={saving||!dirty}>{saving?(lang==="ru"?"Сохраняем…":"Saving…"):(lang==="ru"?"Сохранить изменения":"Save changes")}</Button>{saved&&<p className="success-note" role="status">{lang==="ru"?"Изменения сохранены":"Changes saved"}</p>}{dirty&&<button type="button" className="text-action discard-draft" onClick={()=>{editing.current=false;setDirty(false);setError("");void load()}}>{lang==="ru"?"Сбросить изменения и обновить":"Discard changes and refresh"}</button>}</section>}
    </div><section className="account-panel chat-panel"><div className="panel-title"><h2>{lang==="ru"?"Чат заказа":"Order chat"}</h2><small>{lang==="ru"?"Обновляется каждые 15 секунд":"Refreshes every 15 seconds"}</small></div>{data&&<ChatHistory key={id} endpoint={`/api/orders/${id}`} page={data} currentUserId={data.currentUserId} role={data.role} lang={lang} empty={<p className="muted">{lang==="ru"?"Сообщений пока нет. Начните переписку здесь.":"No messages yet. Start the conversation here."}</p>}/>}<form onSubmit={send}><label htmlFor="message">{lang==="ru"?"Сообщение":"Message"}</label><Textarea id="message" value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} rows={3} placeholder={lang==="ru"?"Напишите сообщение…":"Write a message…"}/><p className="credential-note">{lang==="ru"?"Не отправляйте пароль Steam или код Steam Guard в чат.":"Do not send Steam passwords or Steam Guard codes in chat."}</p><Button className="account-cta" disabled={sending||!body.trim()}>{lang==="ru"?"Отправить":"Send"}<Send size={17}/></Button></form></section></div>}
  </AccountShell>;
}
