"use client";

import { BarChart3, ChevronLeft, ChevronRight, ListFilter, MessagesSquare, Settings2, TicketPercent } from "lucide-react";

export function WorkspaceNav({ active, ru, admin = true }: { active: "orders" | "inbox" | "promos" | "analytics" | "account" | "support"; ru: boolean; admin?: boolean }) {
  return <nav className="workspace-nav" aria-label={ru ? (admin ? "Администрирование" : "Личный кабинет") : (admin ? "Administration" : "Account")}>
    <a className={active === "orders" ? "active" : ""} href="/dashboard" aria-current={active === "orders" ? "page" : undefined}><ListFilter size={17}/>{ru ? "Заказы" : "Orders"}</a>
    {admin ? <><a className={active === "inbox" ? "active" : ""} href="/inbox" aria-current={active === "inbox" ? "page" : undefined}><MessagesSquare size={17}/>{ru ? "Входящие" : "Inbox"}</a>
    <a className={active === "promos" ? "active" : ""} href="/promos" aria-current={active === "promos" ? "page" : undefined}><TicketPercent size={17}/>{ru ? "Промокоды" : "Promo codes"}</a>
    <a className={active === "analytics" ? "active" : ""} href="/analytics" aria-current={active === "analytics" ? "page" : undefined}><BarChart3 size={17}/>{ru ? "Источники" : "Sources"}</a></> : <a className={active === "support" ? "active" : ""} href="/support" aria-current={active === "support" ? "page" : undefined}><MessagesSquare size={17}/>{ru ? "Поддержка" : "Support"}</a>}
    <a className={active === "account" ? "active" : ""} href="/account" aria-current={active === "account" ? "page" : undefined}><Settings2 size={17}/>{ru ? "Настройки" : "Settings"}</a>
  </nav>;
}

export function Pagination({ page, pages, total, busy, onPage, ru }: { page: number; pages: number; total: number; busy: boolean; onPage: (page: number) => void; ru: boolean }) {
  return <div className="list-pagination"><span>{ru ? "Найдено" : "Found"}: <b>{total}</b></span><div><button type="button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label={ru ? "Предыдущая страница" : "Previous page"}><ChevronLeft size={17}/></button><span>{page} / {pages}</span><button type="button" disabled={busy || page >= pages} onClick={() => onPage(page + 1)} aria-label={ru ? "Следующая страница" : "Next page"}><ChevronRight size={17}/></button></div></div>;
}
