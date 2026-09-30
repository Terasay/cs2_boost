"use client";

import { useEffect, useState } from "react";
import { AccountShell, api, useLanguage } from "../account-ui";
import { services, serviceSlugs, type ServiceSlug, type Language } from "@/lib/marketing";
import { cleanAttribution } from "@/lib/attribution.mjs";

type Counts = { requests: number; completed: number; active: number };
type Report = { since: number; total: Counts; rows: (Counts & { source: string | null; medium: string | null; campaign: string | null; content: string | null })[] };

export default function Analytics() {
  const lang = useLanguage();
  const ru = lang === "ru";
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [source, setSource] = useState("telegram");
  const [medium, setMedium] = useState("paid_social");
  const [campaign, setCampaign] = useState("launch");
  const [content, setContent] = useState("");
  const [page, setPage] = useState<ServiceSlug>("premier-boost");
  const [targetLanguage, setTargetLanguage] = useState<Language>("ru");
  useEffect(() => { let active = true; void api<Report>("/api/analytics").then(data => { if (active) { setReport(data); setOrigin(window.location.origin); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Error"); }); return () => { active = false; }; }, []);
  const clean = cleanAttribution({ source, medium, campaign, content });
  const valid = clean && [source, medium, campaign, content].every(value => value.length <= 80 && (!value || /^[\p{L}\p{N}_.~ -]+$/u.test(value)));
  const query = new URLSearchParams();
  if (valid && clean) for (const [key, value] of Object.entries(clean)) query.set(`utm_${key}`, value as string);
  const link = valid && origin ? `${origin}/${targetLanguage}/${page}?${query}` : "";
  return <AccountShell back="/dashboard" backLabel={ru ? "К заказам" : "Orders"}><div className="account-intro"><span className="kicker">ADMIN / {ru ? "ИСТОЧНИКИ" : "SOURCES"}</span><h1>{ru ? "Откуда приходят заявки" : "Where requests come from"}</h1><p>{ru ? "Последние 30 дней. Источник определяется по UTM-меткам ссылки, с которой пришёл клиент." : "Last 30 days. Sources come from the UTM tags on the client's entry link."}</p></div>
    {error ? <p className="error" role="alert">{error}</p> : !report ? <p className="muted">{ru ? "Загружаем данные…" : "Loading…"}</p> : <>
      <div className="analytics-counts">{([['requests', ru ? 'Заявки' : 'Requests'], ['active', ru ? 'В работе' : 'In progress'], ['completed', ru ? 'Завершены' : 'Completed']] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{report.total[key]}</strong></div>)}</div>
      <section className="account-panel"><h2>{ru ? "Источники заявок" : "Request sources"}</h2><p className="muted">{ru ? "До 50 сочетаний меток. «Без меток» включает старые заказы и переходы без UTM. Это не счётчик посещений или подтверждённых платежей." : "Up to 50 tag combinations. “Untagged” includes older orders and visits without UTM tags. This is not a visitor or verified payment counter."}</p>{!report.rows.length ? <p className="muted">{ru ? "За этот период заявок нет." : "No requests during this period."}</p> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr>{[ru ? "Источник / канал" : "Source / medium", ru ? "Кампания / объявление" : "Campaign / content", ru ? "Заявки" : "Requests", ru ? "В работе" : "Active", ru ? "Завершены" : "Completed"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}><td>{row.source || (ru ? "Без меток" : "Untagged")}<small>{row.medium || "—"}</small></td><td>{row.campaign || "—"}<small>{row.content || "—"}</small></td><td>{row.requests}</td><td>{row.active}</td><td>{row.completed}</td></tr>)}</tbody></table></div>}</section>
      <section className="account-panel campaign-builder"><h2>{ru ? "Ссылка для размещения" : "Campaign link"}</h2><p className="muted">{ru ? "Укажите понятные названия без персональных данных. Например: telegram / paid_social / launch / channel_a. Для каждого размещения используйте свою метку." : "Use recognizable labels without personal data. For example: telegram / paid_social / launch / channel_a. Give each placement its own tag."}</p><div className="campaign-fields">{[["source", "utm_source", source, setSource], ["medium", "utm_medium", medium, setMedium], ["campaign", "utm_campaign", campaign, setCampaign], ["content", "utm_content", content, setContent]].map(([id, label, value, setter]) => <label key={id as string} htmlFor={`utm-${id}`}><span>{label as string}</span><input id={`utm-${id}`} value={value as string} maxLength={80} onChange={event => (setter as (value: string) => void)(event.target.value)}/></label>)}</div><label htmlFor="campaign-language">{ru ? "Язык страницы" : "Landing page language"}</label><select id="campaign-language" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value as Language)}><option value="ru">Русский</option><option value="en">English</option></select><label htmlFor="campaign-page">{ru ? "Страница" : "Page"}</label><select id="campaign-page" value={page} onChange={event => setPage(event.target.value as ServiceSlug)}>{serviceSlugs.map(slug => <option key={slug} value={slug}>{services[targetLanguage][slug].heading}</option>)}</select><label htmlFor="campaign-link">{ru ? "Готовая ссылка — выделите и скопируйте" : "Your link — select and copy"}</label><textarea id="campaign-link" rows={3} readOnly value={link} onFocus={event => event.currentTarget.select()}/>{!valid && <p className="error">{ru ? "Укажите источник. В метках допустимы буквы, цифры, пробелы и символы _ . ~ -; максимум 80 символов." : "Enter a source. Use letters, numbers, spaces or _ . ~ -; at most 80 characters per tag."}</p>}</section>
    </>}
  </AccountShell>;
}
