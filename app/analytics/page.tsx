"use client";

import { useEffect, useState } from "react";
import { BarChart3, Link2 } from "lucide-react";
import { AccountShell, useLanguage } from "../account-ui";
import { WorkspaceNav } from "../workspace-ui";
import { useLiveResource } from "../use-live-resource";
import { LinkCopy } from "../link-copy";
import { services, serviceSlugs, type ServiceSlug, type Language } from "@/lib/marketing";
import { cleanAttribution } from "@/lib/attribution.mjs";

type Counts = { requests: number; completed: number; active: number };
type Report = { since: number; total: Counts; rows: (Counts & { source: string | null; medium: string | null; campaign: string | null; content: string | null })[] };

export default function Analytics() {
  const lang = useLanguage();
  const ru = lang === "ru";
  const resource = useLiveResource<Report>("/api/analytics", 30000, false, "/dashboard");
  const report = resource.data;
  const [origin, setOrigin] = useState("");
  const [source, setSource] = useState("telegram");
  const [medium, setMedium] = useState("paid_social");
  const [campaign, setCampaign] = useState("launch");
  const [content, setContent] = useState("");
  const [page, setPage] = useState<ServiceSlug>("premier-boost");
  const [targetLanguage, setTargetLanguage] = useState<Language>("ru");
  useEffect(() => { const timer = setTimeout(() => setOrigin(window.location.origin), 0); return () => clearTimeout(timer); }, []);
  const clean = cleanAttribution({ source, medium, campaign, content });
  const valid = clean && [source, medium, campaign, content].every(value => value.length <= 80 && (!value || /^[\p{L}\p{N}_.~ -]+$/u.test(value)));
  const query = new URLSearchParams();
  if (valid && clean) for (const [key, value] of Object.entries(clean)) query.set(`utm_${key}`, value as string);
  const link = valid && origin ? `${origin}/${targetLanguage}/${page}?${query}` : "";
  const fields = [
    { id: "source", label: ru ? "Источник" : "Source", value: source, set: setSource },
    { id: "medium", label: ru ? "Канал" : "Medium", value: medium, set: setMedium },
    { id: "campaign", label: ru ? "Кампания" : "Campaign", value: campaign, set: setCampaign },
    { id: "content", label: ru ? "Объявление" : "Placement", value: content, set: setContent },
  ];
  return <AccountShell workspace back="/dashboard" backLabel={ru ? "К заказам" : "Orders"}>
    <WorkspaceNav active="analytics" ru={ru}/>
    <header className="board-heading"><div><span className="kicker">ADMIN / SOURCES</span><h1>{ru ? "Источники заявок" : "Request sources"}</h1><p>{ru ? "Последние 30 дней · отслеживание размещений по UTM-меткам" : "Last 30 days · track placements with UTM tags"}</p></div></header>
    {resource.error && <p className="error" role="alert">{resource.error}</p>}
    {!report ? <div className="list-placeholder">{resource.error ? (ru ? "Данные недоступны. Попробуйте обновить страницу." : "Data unavailable. Try refreshing the page.") : (ru ? "Загружаем данные…" : "Loading…")}</div> : <>
      <div className="analytics-counts">{([['requests', ru ? 'Заявки' : 'Requests'], ['active', ru ? 'В работе' : 'In progress'], ['completed', ru ? 'Завершены' : 'Completed']] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{report.total[key]}</strong></div>)}</div>
      <div className="analytics-layout">
        <section className="account-panel"><div className="panel-heading"><span className="panel-icon"><BarChart3 size={20}/></span><div><h2>{ru ? "Результаты размещений" : "Placement results"}</h2><p>{ru ? "Заказы по источникам и кампаниям" : "Orders by source and campaign"}</p></div></div>
          {!report.rows.length ? <div className="list-placeholder"><BarChart3 size={28}/><p>{ru ? "Заявок пока нет. Создайте ссылку для первого размещения рядом." : "No requests yet. Create a link for your first placement."}</p></div> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr>{[ru ? "Источник / канал" : "Source / medium", ru ? "Кампания" : "Campaign", ru ? "Заявки" : "Requests", ru ? "В работе" : "Active", ru ? "Готово" : "Completed"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}><td>{row.source || (ru ? "Без меток" : "Untagged")}<small>{row.medium || "—"}</small></td><td>{row.campaign || "—"}<small>{row.content || "—"}</small></td><td>{row.requests}</td><td>{row.active}</td><td>{row.completed}</td></tr>)}</tbody></table></div>}
          <p className="muted">{ru ? "До 50 сочетаний меток. «Без меток» — переходы без UTM и старые заказы. Здесь учитываются заявки, а не посещения и оплаты." : "Up to 50 tag combinations. Untagged includes entries without UTM and older orders. These are request counts, not visits or payments."}</p>
        </section>
        <section className="account-panel campaign-builder"><div className="panel-heading"><span className="panel-icon"><Link2 size={20}/></span><div><h2>{ru ? "Ссылка для размещения" : "Campaign link"}</h2><p>{ru ? "Своя метка для каждого канала или объявления." : "Give each channel or placement its own tag."}</p></div></div>
          <div className="campaign-fields">{fields.map(field => <label key={field.id} htmlFor={`utm-${field.id}`}><span>{field.label} · utm_{field.id}</span><input id={`utm-${field.id}`} value={field.value} maxLength={80} onChange={event => field.set(event.target.value)}/></label>)}
            <label htmlFor="campaign-language"><span>{ru ? "Язык страницы" : "Page language"}</span><select id="campaign-language" value={targetLanguage} onChange={event => setTargetLanguage(event.target.value as Language)}><option value="ru">Русский</option><option value="en">English</option></select></label>
            <label htmlFor="campaign-page"><span>{ru ? "Услуга" : "Service"}</span><select id="campaign-page" value={page} onChange={event => setPage(event.target.value as ServiceSlug)}>{serviceSlugs.map(slug => <option key={slug} value={slug}>{services[targetLanguage][slug].heading}</option>)}</select></label>
          </div>
          <LinkCopy value={link} label={ru ? "Готовая ссылка" : "Your link"} ru={ru} multiline/>
          {!valid && <p className="error" role="alert">{ru ? "Укажите источник. Допустимы буквы, цифры, пробелы и _ . ~ -; до 80 символов." : "Enter a source. Use letters, numbers, spaces or _ . ~ -; at most 80 characters."}</p>}
          <p className="muted">{ru ? "Не добавляйте в метки персональные данные." : "Keep personal data out of your tags."}</p>
        </section>
      </div>
    </>}
  </AccountShell>;
}
