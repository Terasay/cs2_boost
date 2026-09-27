import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { readStorage, writeStorage } from "../lib/browser-storage";
import { createRoot } from "react-dom/client";
import { ArrowRight, Check, ChevronRight, Headset, LockKeyhole, LogOut, Menu, MessageCircle, ShieldCheck, Target, UserRound, X } from "lucide-react";
import "./style.css";

type Language = "ru" | "en";
type Platform = "premier" | "faceit";
type Method = "piloted" | "duo";
type Status = "new" | "quoted" | "in_progress" | "completed" | "cancelled";
type Role = "client" | "admin";
type Account = { email: string; passwordHash: string; createdAt: number };
type Message = { id: string; author: Role; text: string; createdAt: number };
type Order = { id: string; clientEmail: string; platform: Platform; method: Method; calibration: boolean; current: string; target: string; status: Status; quote: string; deadline: string; accepted: boolean; createdAt: number; messages: Message[] };
type SupportThread = { id: string; clientEmail: string; status: "open" | "closed"; updatedAt: number; messages: Message[] };
type Data = { accounts: Account[]; orders: Order[]; support?: SupportThread[] };
type Session = { email: string; role: Role } | null;
type Draft = { platform: Platform; method: Method; calibration: boolean; current: string; target: string };

const dataKey = "cs2-boost-pages-demo-v1";
const sessionKey = "cs2-boost-pages-session-v1";
const draftKey = "cs2-boost-pages-draft-v1";
const adminEmail = "admin@demo.local";
const adminPassword = "demo-admin-123";
const emptyData: Data = { accounts: [], orders: [], support: [] };
const emptyDraft: Draft = { platform: "premier", method: "piloted", calibration: false, current: "", target: "" };
const hero = `${import.meta.env.BASE_URL}hero-arena.png`;

const messageSchema = z.object({ id: z.string(), author: z.enum(["client", "admin"]), text: z.string(), createdAt: z.number().int().min(0).max(8640000000000000) });
const draftSchema = z.object({ platform: z.enum(["premier", "faceit"]), method: z.enum(["piloted", "duo"]), calibration: z.boolean(), current: z.string(), target: z.string() });
const orderSchema = draftSchema.extend({ id: z.string(), clientEmail: z.string(), status: z.enum(["new", "quoted", "in_progress", "completed", "cancelled"]), quote: z.string(), deadline: z.string(), accepted: z.boolean(), createdAt: z.number().int().min(0).max(8640000000000000), messages: z.array(messageSchema) });
const dataSchema = z.object({ accounts: z.array(z.object({ email: z.string(), passwordHash: z.string(), createdAt: z.number() })), orders: z.array(orderSchema), support: z.array(z.object({ id: z.string(), clientEmail: z.string(), status: z.enum(["open", "closed"]), updatedAt: z.number().int().min(0).max(8640000000000000), messages: z.array(messageSchema) })).optional() });
const sessionSchema = z.object({ email: z.string(), role: z.enum(["client", "admin"]) }).nullable();
function readJson<T>(key: string, fallback: T, storage: "localStorage" | "sessionStorage"): T {
  try {
    const value = JSON.parse(readStorage(storage, key) ?? "null");
    const parsed = (key === dataKey ? dataSchema : key === draftKey ? draftSchema : sessionSchema).safeParse(value);
    return parsed.success ? parsed.data as T : fallback;
  } catch { return fallback; }
}

function route() {
  return window.location.hash.replace(/^#\/?/, "") || "home";
}

function go(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function passwordHash(email: string, password: string) {
  const bytes = new TextEncoder().encode(`${email.toLowerCase().trim()}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function formatDate(value: number, lang: Language) {
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function App() {
  const [lang, setLang] = useState<Language>(() => (readStorage("localStorage","cs2-boost-language") === "en" ? "en" : "ru"));
  const [page, setPage] = useState(route);
  const [data, setData] = useState<Data>(() => readJson(dataKey, emptyData, "localStorage"));
  const [session, setSession] = useState<Session>(() => readJson(sessionKey, null, "sessionStorage"));
  const [draft, setDraft] = useState<Draft>(() => readJson(draftKey, emptyDraft, "sessionStorage"));
  const [menu, setMenu] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [inboxTab, setInboxTab] = useState<"support" | "orders">("orders");
  const [inboxSearch, setInboxSearch] = useState("");
  const [error, setError] = useState("");
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;

  useEffect(() => {
    const onHash = () => { setPage(route()); setError(""); setMenu(false); };
    const onStorage = (event: StorageEvent) => { if (event.key === dataKey) setData(readJson(dataKey, emptyData, "localStorage")); };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("storage", onStorage); };
  }, []);
  useEffect(() => {
    if (!page.startsWith("home") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = document.querySelectorAll<HTMLElement>(".section h2,.service-grid article,.step-grid>div,.faq-grid>div");
    const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } } }, { threshold: .12, rootMargin: "0px 0px -35px 0px" });
    elements.forEach(element => { element.classList.add("scroll-reveal"); observer.observe(element); });
    return () => observer.disconnect();
  }, [page]);

  function updateData(next: Data) {
    if(!writeStorage("localStorage",dataKey,JSON.stringify(next))){setError(t("Не удалось сохранить данные. Проверьте свободное место и разрешения браузера.","Could not save data. Check browser storage permissions and space."));return false;}
    setData(next);
    return true;
  }

  function updateDraft(next: Draft) {
    writeStorage("sessionStorage",draftKey, JSON.stringify(next));
    setDraft(next);
  }

  function signIn(next: Session) {
    if(!writeStorage("sessionStorage",sessionKey, JSON.stringify(next))){setError(t("Разрешите хранение данных в браузере для входа.","Allow browser storage to sign in."));return;}
    setSession(next);
    if (next?.role === "client" && (draft.calibration || draft.target.trim())) createOrder(next.email);
    else go("dashboard");
  }

  function signOut() {
    writeStorage("sessionStorage",sessionKey,null);
    setSession(null);
    go("home");
  }

  function createOrder(email: string, source = data) {
    const order: Order = {
      id: crypto.randomUUID().slice(0, 8).toUpperCase(),
      clientEmail: email,
      platform: draft.platform,
      method: draft.method,
      calibration: draft.calibration,
      current: draft.current.trim(),
      target: draft.target.trim(),
      status: "new",
      quote: "",
      deadline: "",
      accepted: false,
      createdAt: Date.now(),
      messages: [],
    };
    if(!updateData({ ...source, orders: [order, ...source.orders] }))return;
    writeStorage("sessionStorage",draftKey,null);
    setDraft(emptyDraft);
    go(`order/${order.id}`);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!draft.calibration && !draft.target.trim()) { setError(t("Укажите целевой рейтинг.", "Enter a target rating.")); return; }
    if (!draft.calibration && !draft.current.trim()) { setError(t("Укажите текущий рейтинг.", "Enter a current rating.")); return; }
    if(!draft.calibration && (!Number.isInteger(Number(draft.current)) || !Number.isInteger(Number(draft.target)) || Number(draft.current)<0 || Number(draft.target)>100000 || Number(draft.target)<=Number(draft.current))){setError(t("Укажите целые рейтинги от 0 до 100 000. Цель должна быть выше текущего.","Enter whole ratings from 0 to 100,000. The target must be higher."));return;}
    if (session?.role === "client") createOrder(session.email);
    else go("register");
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim().toLowerCase();
    const password = String(fields.get("password") || "");
    if (data.accounts.some(account => account.email === email) || email === adminEmail) { setError(t("Этот email уже используется.", "This email is already in use.")); return; }
    if (password.length < 10) { setError(t("Пароль должен содержать не менее 10 символов.", "Use at least 10 characters for the password.")); return; }
    const account: Account = { email, passwordHash: await passwordHash(email, password), createdAt: Date.now() };
    const next = { ...data, accounts: [...data.accounts, account] };
    if(!updateData(next))return;
    writeStorage("sessionStorage",sessionKey, JSON.stringify({ email, role: "client" }));
    setSession({ email, role: "client" });
    if (draft.calibration || draft.target.trim()) createOrder(email, next);
    else go("dashboard");
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "").trim().toLowerCase();
    const password = String(fields.get("password") || "");
    if (email === adminEmail && password === adminPassword) { signIn({ email, role: "admin" }); return; }
    const account = data.accounts.find(item => item.email === email);
    if (!account || account.passwordHash !== await passwordHash(email, password)) { setError(t("Неверный email или пароль.", "Incorrect email or password.")); return; }
    signIn({ email, role: "client" });
  }

  function changeOrder(id: string, change: Partial<Order>) {
    updateData({ ...data, orders: data.orders.map(order => order.id === id ? { ...order, ...change } : order) });
  }

  function sendSupport(text: string) {
    if (!session) return;
    const existing = (data.support ?? []).find(thread => thread.clientEmail === session.email);
    const message: Message = { id: crypto.randomUUID(), author: "client", text, createdAt: Date.now() };
    const next = existing ? (data.support ?? []).map(thread => thread.id === existing.id ? { ...thread, status: "open" as const, updatedAt: Date.now(), messages: [...thread.messages, message] } : thread) : [...(data.support ?? []), { id: crypto.randomUUID().slice(0, 8).toUpperCase(), clientEmail: session.email, status: "open" as const, updatedAt: Date.now(), messages: [message] }];
    updateData({ ...data, support: next });
  }

  function changeSupport(id: string, change: Partial<SupportThread>) {
    updateData({ ...data, support: (data.support ?? []).map(thread => thread.id === id ? { ...thread, ...change, updatedAt: Date.now() } : thread) });
  }

  const selected = page.startsWith("order/") ? data.orders.find(order => order.id === page.slice(6)) : undefined;
  const supportThreads = data.support ?? [];
  const selectedSupport = page.startsWith("support/") ? supportThreads.find(thread => thread.id === page.slice(8)) : supportThreads.find(thread => thread.clientEmail === session?.email);
  const visibleOrders = session?.role === "admin" ? data.orders : data.orders.filter(order => order.clientEmail === session?.email);
  const statusLabel = (status: Status) => ({ new: t("Новая", "New"), quoted: t("Предложение", "Quoted"), in_progress: t("В работе", "In progress"), completed: t("Завершён", "Completed"), cancelled: t("Отменён", "Cancelled") })[status];
  const platformLabel = (platform: Platform) => platform === "premier" ? "Premier" : "FACEIT";
  const methodLabel = (method: Method) => method === "piloted" ? t("Передача аккаунта", "Account access") : t("Игра вместе", "Play together");

  return <div className="site-shell">
    {error && !["home","login","register"].some(item=>page.startsWith(item))&&<div className="shell error" role="alert">{error}</div>}<div className="demo-bar"><div className="shell demo-bar-inner"><ShieldCheck size={16}/><span>{t("Демоверсия: данные хранятся только в этом браузере. Используйте вымышленные email и пароли. Данные Steam не вводите.", "Demo: data is stored only in this browser. Use fictional email addresses and passwords. Do not enter Steam credentials.")}</span></div></div>
    <header className="shell header"><a className="brand" href="#home"><span className="brand-mark">C<span>2</span></span><span>CS2 <b>BOOST</b></span></a><button className="menu-button" onClick={() => setMenu(!menu)} aria-label={t("Меню", "Menu")}>{menu ? <X size={23}/> : <Menu size={23}/>}</button><nav className={menu ? "nav open" : "nav"}><a href="#home">{t("Главная", "Home")}</a><a href="#home-services">{t("Услуги", "Services")}</a><a href="#home-process">{t("Как это работает", "How it works")}</a><a href="#home-faq">FAQ</a></nav><div className="header-actions">{session && <button className="header-inbox" onClick={() => go(session.role === "admin" ? "inbox" : "support")}>{session.role === "admin" ? <MessageCircle size={16}/> : <Headset size={16}/>}<span>{session.role === "admin" ? t("Входящие", "Inbox") : t("Поддержка", "Support")}</span></button>}<div className="language"><button className={lang === "ru" ? "active" : ""} onClick={() => { setLang("ru"); writeStorage("localStorage","cs2-boost-language", "ru"); document.documentElement.lang="ru"; }}>RU</button><span>/</span><button className={lang === "en" ? "active" : ""} onClick={() => { setLang("en"); writeStorage("localStorage","cs2-boost-language", "en"); document.documentElement.lang="en"; }}>EN</button></div>{session ? <button className="header-account" onClick={() => go("dashboard")}><UserRound size={17}/>{t("Кабинет", "Account")}</button> : <button className="header-account" onClick={() => go("login")}><UserRound size={17}/>{t("Войти", "Sign in")}</button>}</div></header>

    {page === "home" || page.startsWith("home-") ? <main>
      <section className="shell hero"><div className="hero-copy"><span className="eyebrow">PREMIER / FACEIT / CS2</span><h1>{t("Твой рейтинг. Твоя цель. ", "Your rating. Your goal. ")}<em>{t("Наш маршрут.", "Our route.")}</em></h1><p>{t("Буст рейтинга и калибровка в Premier и FACEIT. Выберите формат, оставьте заявку и общайтесь с исполнителем в личном кабинете.", "Rating boost and calibration in Premier and FACEIT. Choose a format, send a request, and talk to the team in your account.")}</p><div className="hero-points"><span><Check size={17}/>{t("Premier и FACEIT", "Premier and FACEIT")}</span><span><Check size={17}/>{t("Соло или вместе", "Solo or together")}</span><span><Check size={17}/>{t("Чат по заказу", "Order chat")}</span></div><div className="hero-image" style={{ backgroundImage: `url(${hero})` }}><span>COUNTER-STRIKE 2 / BOOST SERVICE</span></div></div><form className="quote-card" onSubmit={submitRequest}><div className="quote-head"><div><span className="eyebrow">01 / {t("НАСТРОЙКА ЗАКАЗА", "REQUEST SETUP")}</span><h2>{t("Выбери свою цель", "Set your goal")}</h2></div><Target size={25}/></div><div className="quote-body"><label>{t("Площадка", "Platform")}</label><div className="segments"><button type="button" className={draft.platform === "premier" ? "selected" : ""} onClick={() => updateDraft({ ...draft, platform: "premier" })}>Premier</button><button type="button" className={draft.platform === "faceit" ? "selected" : ""} onClick={() => updateDraft({ ...draft, platform: "faceit" })}>FACEIT</button></div><label>{t("Тип услуги", "Service")}</label><label className="checkline"><input type="checkbox" checked={draft.calibration} onChange={event => updateDraft({ ...draft, calibration: event.target.checked, current: event.target.checked ? "" : draft.current })}/>{t("Калибровка", "Calibration")}</label><div className="rating-row">{!draft.calibration && <div><label htmlFor="current">{t("Текущий рейтинг", "Current rating")}</label><input id="current" inputMode="numeric" placeholder={draft.platform === "premier" ? "5 000" : "3"} value={draft.current} onChange={event => updateDraft({ ...draft, current: event.target.value })}/></div>}{!draft.calibration&&<div><label htmlFor="target">{t("Целевой рейтинг", "Target rating")}</label><input id="target" inputMode="numeric" placeholder={draft.platform === "premier" ? "10 000" : "8"} value={draft.target} onChange={event => updateDraft({ ...draft, target: event.target.value })}/></div>}</div><label>{t("Формат", "Method")}</label><div className="segments"><button type="button" className={draft.method === "piloted" ? "selected" : ""} onClick={() => updateDraft({ ...draft, method: "piloted" })}>{t("Передача аккаунта", "Account access")}</button><button type="button" className={draft.method === "duo" ? "selected" : ""} onClick={() => updateDraft({ ...draft, method: "duo" })}>{t("Игра вместе", "Play together")}</button></div><div className="estimate"><span>{t("Цена и срок", "Price and timeline")}</span><strong>{t("После обсуждения", "After discussion")}</strong></div>{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" type="submit">{session?.role === "client" ? t("Создать заявку", "Create request") : t("Продолжить и создать аккаунт", "Continue and create account")}<ArrowRight size={19}/></button></div></form></section>
      <section id="home-services" className="section section-alt"><div className="shell"><span className="eyebrow">02 / {t("УСЛУГИ", "SERVICES")}</span><h2>{t("Под вашу задачу", "Built around your goal")}</h2><div className="service-grid"><article><Target size={27}/><span>01</span><h3>Premier</h3><p>{t("Повышение рейтинга или прохождение калибровки в режиме Premier.", "Rating growth or calibration in Premier mode.")}</p></article><article><ShieldCheck size={27}/><span>02</span><h3>FACEIT</h3><p>{t("Работа с уровнем и Elo на FACEIT в согласованном формате.", "Level and Elo progress on FACEIT in the agreed format.")}</p></article><article><MessageCircle size={27}/><span>03</span><h3>{t("Сопровождение", "Support")}</h3><p>{t("Условия, срок и статус заказа всегда доступны в личном кабинете.", "Terms, timeline, and order status stay in your account.")}</p></article></div></div></section>
      <section id="home-process" className="section"><div className="shell"><span className="eyebrow">03 / {t("ПРОЦЕСС", "PROCESS")}</span><h2>{t("От цели до результата", "From goal to result")}</h2><div className="step-grid"><div><strong>01</strong><h3>{t("Оставьте заявку", "Send a request")}</h3><p>{t("Укажите площадку, текущий рейтинг и желаемый результат.", "Choose the platform, current rating, and target.")}</p></div><div><strong>02</strong><h3>{t("Согласуйте условия", "Agree on terms")}</h3><p>{t("Администратор ответит в чате и подтвердит цену и срок.", "An admin replies in chat and confirms price and timeline.")}</p></div><div><strong>03</strong><h3>{t("Следите за заказом", "Track your order")}</h3><p>{t("Статус заказа обновляется в личном кабинете.", "Your account shows the current order status.")}</p></div></div></div></section>
      <section id="home-faq" className="section section-alt"><div className="shell faq-grid"><div><span className="eyebrow">04 / FAQ</span><h2>{t("Частые вопросы", "Common questions")}</h2><p className="muted">{t("Детали каждого заказа обсуждаются лично.", "Order details are discussed individually.")}</p></div><div>{[[t("Как узнать цену?", "How do I get a price?"),t("Оставьте заявку. Администратор оценит задачу и напишет вам в чате.", "Send a request. An admin will review it and reply in chat.")],[t("Можно играть вместе с бустером?", "Can I play with the booster?"),t("Да. Выберите формат «Игра вместе» при оформлении заявки.", "Yes. Choose Play together when sending your request.")],[t("Где смотреть статус?", "Where can I see the status?"),t("В карточке заказа в личном кабинете.", "In the order details in your account.")]].map(([question,answer],index)=><div className={faqOpen===index?"faq-item open":"faq-item"} key={question}><button className="faq-question" aria-expanded={faqOpen===index} onClick={()=>setFaqOpen(faqOpen===index?null:index)}>{question}<span aria-hidden="true">+</span></button><div className="faq-answer" aria-hidden={faqOpen!==index}><div><p>{answer}</p></div></div></div>)}</div></div></section>
    </main> : null}

    {page === "register" && <main className="shell inner-page"><div className="page-intro"><span className="eyebrow">CS2 BOOST / {t("АККАУНТ", "ACCOUNT")}</span><h1>{t("Создать аккаунт", "Create an account")}</h1><p>{t("После регистрации заявка появится в личном кабинете.", "Your request will appear in your account after registration.")}</p></div><div className="form-layout"><form className="panel" onSubmit={register}><h2>{t("Данные для входа", "Sign-in details")}</h2><label htmlFor="register-email">Email</label><input id="register-email" name="email" type="email" required autoComplete="email" placeholder="name@example.com"/><label htmlFor="register-password">{t("Пароль", "Password")}</label><input id="register-password" name="password" type="password" minLength={10} required autoComplete="new-password" placeholder={t("Не менее 10 символов", "At least 10 characters")}/><label className="checkline risk"><input type="checkbox" required/>{t("Я понимаю, что буст может нарушать правила игровых платформ и несу связанные с этим риски.", "I understand that boosting may violate game platform rules and accept the related risks.")}</label>{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" type="submit">{t("Создать аккаунт", "Create account")}<ArrowRight size={18}/></button><p className="form-foot">{t("Уже есть аккаунт?", "Already have an account?")} <a href="#login">{t("Войти", "Sign in")}</a></p></form><aside className="panel summary-panel"><h2>{t("Ваша заявка", "Your request")}</h2><dl><div><dt>{t("Площадка", "Platform")}</dt><dd>{platformLabel(draft.platform)}</dd></div><div><dt>{t("Услуга", "Service")}</dt><dd>{draft.calibration ? t("Калибровка", "Calibration") : t("Буст рейтинга", "Rating boost")}</dd></div><div><dt>{t("Цель", "Target")}</dt><dd>{draft.target || "—"}</dd></div><div><dt>{t("Формат", "Method")}</dt><dd>{methodLabel(draft.method)}</dd></div></dl><p>{t("После регистрации откроется заказ и чат с администратором.", "The order and admin chat will open after registration.")}</p></aside></div></main>}

    {page === "login" && <main className="shell inner-page"><div className="login-grid"><div><div className="page-intro"><span className="eyebrow">CS2 BOOST / {t("АККАУНТ", "ACCOUNT")}</span><h1>{t("Вход в аккаунт", "Sign in")}</h1><p>{t("Вернитесь к своим заказам и переписке.", "Return to your orders and chat.")}</p></div><form className="panel" onSubmit={login}><label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" required autoComplete="email"/><label htmlFor="login-password">{t("Пароль", "Password")}</label><input id="login-password" name="password" type="password" required autoComplete="current-password"/>{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" type="submit">{t("Войти", "Sign in")}<ArrowRight size={18}/></button><p className="form-foot">{t("Нет аккаунта?", "No account?")} <a href="#home">{t("Начать с заявки", "Start a request")}</a></p></form><div className="demo-access"><LockKeyhole size={17}/><span>{t("Тестовый вход администратора:", "Demo admin access:")} <b>{adminEmail}</b> / <b>{adminPassword}</b></span></div></div><aside className="login-image" style={{ backgroundImage: `url(${hero})` }}><div><span>PREMIER / FACEIT</span><strong>{t("Заказы и чат в одном кабинете", "Orders and chat in one place")}</strong></div></aside></div></main>}

    {page === "dashboard" && <main className="shell inner-page"><div className="dashboard-heading"><div className="page-intro"><span className="eyebrow">CS2 BOOST / {t("ЛИЧНЫЙ КАБИНЕТ", "ACCOUNT")}</span><h1>{session?.role === "admin" ? t("Заказы клиентов", "Client orders") : t("Мои заказы", "My orders")}</h1><p>{session?.email || t("Войдите, чтобы увидеть заказы.", "Sign in to view orders.")}</p></div>{session && <button className="quiet-button" onClick={signOut}><LogOut size={17}/>{t("Выйти", "Sign out")}</button>}</div>{!session ? <div className="empty-panel"><UserRound size={28}/><h2>{t("Нужен вход в аккаунт", "Sign in required")}</h2><button className="primary-button short" onClick={() => go("login")}>{t("Войти", "Sign in")}<ArrowRight size={18}/></button></div> : visibleOrders.length ? <div className="orders-list">{visibleOrders.map(order => <button key={order.id} className="order-row" onClick={() => go(`order/${order.id}`)}><div><div className="order-meta"><span>#{order.id}</span><span>{formatDate(order.createdAt, lang)}</span>{session.role === "admin" && <span>{order.clientEmail}</span>}</div><strong>{platformLabel(order.platform)} · {order.calibration ? t("Калибровка", "Calibration") : `${order.current} → ${order.target}`}</strong></div><div className="order-row-end"><span className={`status status-${order.status}`}>{statusLabel(order.status)}</span><ChevronRight size={20}/></div></button>)}</div> : <div className="empty-panel"><Target size={28}/><h2>{t("Заказов пока нет", "No orders yet")}</h2><p>{session.role === "admin" ? t("Заявки клиентов появятся здесь.", "Client requests will appear here.") : t("Выберите цель и отправьте первую заявку.", "Set a goal and send your first request.")}</p>{session.role === "client" && <button className="primary-button short" onClick={() => go("home")}>{t("Создать заявку", "Create request")}<ArrowRight size={18}/></button>}</div>}</main>}

    {page.startsWith("order/") && <main className="shell inner-page">{!session || !selected || (session.role !== "admin" && selected.clientEmail !== session.email) ? <div className="empty-panel"><LockKeyhole size={28}/><h2>{t("Заказ недоступен", "Order unavailable")}</h2><button className="primary-button short" onClick={() => go(session ? "dashboard" : "login")}>{t("К списку заказов", "Go to orders")}<ArrowRight size={18}/></button></div> : <><button className="back-button" onClick={() => go("dashboard")}>← {t("Все заказы", "All orders")}</button><div className="dashboard-heading"><div className="page-intro"><span className="eyebrow">{t("ЗАКАЗ", "ORDER")} #{selected.id}</span><h1>{platformLabel(selected.platform)} · {selected.calibration ? t("Калибровка", "Calibration") : t("Буст рейтинга", "Rating boost")}</h1><p>{session.role === "admin" ? selected.clientEmail : t("Условия и переписка по заказу", "Order terms and conversation")}</p></div><span className={`status status-${selected.status}`}>{statusLabel(selected.status)}</span></div><div className="detail-grid"><div className="detail-column"><section className="panel"><h2>{t("Параметры заказа", "Order details")}</h2><dl className="detail-list"><div><dt>{t("Площадка", "Platform")}</dt><dd>{platformLabel(selected.platform)}</dd></div><div><dt>{t("Формат", "Method")}</dt><dd>{methodLabel(selected.method)}</dd></div><div><dt>{t("Текущий рейтинг", "Current rating")}</dt><dd>{selected.calibration ? t("Калибровка", "Calibration") : selected.current}</dd></div><div><dt>{t("Цель", "Target")}</dt><dd>{selected.target}</dd></div><div><dt>{t("Стоимость", "Price")}</dt><dd>{selected.quote || t("Ожидает согласования", "Awaiting quote")}</dd></div><div><dt>{t("Срок", "Timeline")}</dt><dd>{selected.deadline || t("Ожидает согласования", "Awaiting estimate")}</dd></div></dl>{session.role === "client" && selected.status === "quoted" && !selected.accepted && <button className="primary-button" onClick={() => changeOrder(selected.id, { accepted: true })}>{t("Принять предложение", "Accept quote")}<Check size={18}/></button>}{selected.accepted && <p className="accepted-note"><Check size={16}/>{t("Предложение принято. Дальнейшие шаги согласуйте в чате.", "Quote accepted. Discuss next steps in chat.")}</p>}</section>{session.role === "admin" && <AdminPanel key={selected.id} order={selected} lang={lang} changeOrder={changeOrder}/>}</div><ChatPanel order={selected} role={session.role} lang={lang} send={text => changeOrder(selected.id, { messages: [...selected.messages, { id: crypto.randomUUID(), author: session.role, text, createdAt: Date.now() }] })}/></div></>}</main>}

    {page === "inbox" && <main className="shell inner-page">{session?.role !== "admin" ? <div className="empty-panel"><LockKeyhole size={28}/><h2>{t("Доступ только для администратора", "Admin access required")}</h2><button className="primary-button short" onClick={() => go("login")}>{t("Войти", "Sign in")}<ArrowRight size={18}/></button></div> : <><div className="page-intro"><span className="eyebrow">ADMIN / CS2 BOOST</span><h1>{t("Входящие", "Inbox")}</h1><p>{t("Чаты заказов и обращения в поддержку в одном месте.", "Order chats and support requests in one place.")}</p></div><div className="demo-inbox-toolbar"><div className="demo-inbox-tabs"><button className={inboxTab === "support" ? "active" : ""} onClick={() => setInboxTab("support")}><Headset size={17}/>{t("Поддержка", "Support")} <span>{supportThreads.length}</span></button><button className={inboxTab === "orders" ? "active" : ""} onClick={() => setInboxTab("orders")}><MessageCircle size={17}/>{t("Чаты заказов", "Order chats")} <span>{data.orders.length}</span></button></div><input aria-label={t("Поиск по email или номеру", "Search email or ID")} placeholder={t("Поиск по email или номеру", "Search email or ID")} value={inboxSearch} onChange={event => setInboxSearch(event.target.value)}/></div><div className="orders-list">{inboxTab === "support" ? supportThreads.filter(thread => `${thread.clientEmail} ${thread.id}`.toLowerCase().includes(inboxSearch.toLowerCase())).sort((a,b) => b.updatedAt - a.updatedAt).map(thread => <button key={thread.id} className="order-row demo-inbox-row" onClick={() => go(`support/${thread.id}`)}><div><div className="order-meta"><span>#{thread.id}</span><span>{formatDate(thread.updatedAt, lang)}</span></div><strong>{thread.clientEmail}</strong><p>{thread.messages.at(-1)?.text ?? t("Сообщений нет", "No messages")}</p></div><div className="order-row-end"><span className={`status ${thread.status === "open" ? "status-in_progress" : "status-completed"}`}>{thread.status === "open" ? t("Открыт", "Open") : t("Закрыт", "Closed")}</span><ChevronRight size={20}/></div></button>) : data.orders.filter(order => `${order.clientEmail} ${order.id}`.toLowerCase().includes(inboxSearch.toLowerCase())).sort((a,b) => (b.messages.at(-1)?.createdAt ?? b.createdAt) - (a.messages.at(-1)?.createdAt ?? a.createdAt)).map(order => <button key={order.id} className="order-row demo-inbox-row" onClick={() => go(`order/${order.id}`)}><div><div className="order-meta"><span>#{order.id}</span><span>{formatDate(order.messages.at(-1)?.createdAt ?? order.createdAt, lang)}</span></div><strong>{order.clientEmail} · {platformLabel(order.platform)}</strong><p>{order.messages.at(-1)?.text ?? t("Сообщений нет", "No messages")}</p></div><div className="order-row-end"><span className={`status status-${order.status}`}>{statusLabel(order.status)}</span><ChevronRight size={20}/></div></button>)}</div>{!(inboxTab === "support" ? supportThreads : data.orders).length && <div className="empty-panel"><Headset size={28}/><h2>{t("Пока пусто", "Nothing here yet")}</h2><p>{t("Новые обращения появятся здесь.", "New conversations will appear here.")}</p></div>}</>}</main>}

    {(page === "support" || page.startsWith("support/")) && <main className="shell inner-page">{!session || (session.role === "admin" && !selectedSupport) || (session.role === "client" && page.startsWith("support/") && selectedSupport?.clientEmail !== session.email) ? <div className="empty-panel"><LockKeyhole size={28}/><h2>{t("Чат недоступен", "Conversation unavailable")}</h2><button className="primary-button short" onClick={() => go(session ? "dashboard" : "login")}>{t("Назад", "Back")}<ArrowRight size={18}/></button></div> : <><button className="back-button" onClick={() => go(session.role === "admin" ? "inbox" : "dashboard")}>← {t("Назад", "Back")}</button><div className="page-intro"><span className="eyebrow">CS2 BOOST / {t("ПОДДЕРЖКА", "SUPPORT")}</span><h1>{t("Чат поддержки", "Support chat")}</h1><p>{session.role === "admin" ? selectedSupport?.clientEmail : t("Напишите нам по общим вопросам. Заказы обсуждаются отдельно.", "Ask general questions here. Orders have their own chats.")}</p></div><div className="demo-support-layout"><SupportPanel thread={selectedSupport} role={session.role} lang={lang} send={text => { if (session.role === "admin" && selectedSupport) changeSupport(selectedSupport.id, { status: "open", messages: [...selectedSupport.messages, { id: crypto.randomUUID(), author: "admin", text, createdAt: Date.now() }] }); else sendSupport(text); }}/><aside className="panel demo-support-side"><span className="eyebrow">{t("ОБРАЩЕНИЕ", "TICKET")}</span><h2>{session.role === "admin" ? t("Клиент", "Client") : t("На связи", "Here to help")}</h2><p>{session.role === "admin" ? selectedSupport?.clientEmail : t("По заказу пишите в чате его карточки.", "Use the order chat for order details.")}</p>{selectedSupport && <div className="demo-support-status"><span>{t("Статус", "Status")}</span><strong>{selectedSupport.status === "open" ? t("Открыт", "Open") : t("Закрыт", "Closed")}</strong></div>}{session.role === "admin" && selectedSupport ? <button className="quiet-button" onClick={() => changeSupport(selectedSupport.id, { status: selectedSupport.status === "open" ? "closed" : "open" })}>{selectedSupport.status === "open" ? t("Закрыть обращение", "Close ticket") : t("Открыть обращение", "Reopen ticket")}</button> : <button className="quiet-button" onClick={() => go("dashboard")}>{t("Перейти к заказам", "View orders")}</button>}</aside></div></>}</main>}

    <footer><div className="shell footer-inner"><strong>CS2 <span>BOOST</span></strong><span>PREMIER · FACEIT · CS2</span><a href="#home">↑ {t("Наверх", "Back to top")}</a></div></footer>
  </div>;
}

function AdminPanel({ order, lang, changeOrder }: { order: Order; lang: Language; changeOrder: (id: string, change: Partial<Order>) => void }) {
  const [quote, setQuote] = useState(order.quote);
  const [deadline, setDeadline] = useState(order.deadline);
  const [status, setStatus] = useState<Status>(order.status);
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeOrder(order.id, { quote: quote.trim(), deadline: deadline.trim(), status, accepted: status === "quoted" ? order.accepted : false });
  }
  return <form className="panel admin-panel" onSubmit={save}><h2>{t("Управление заказом", "Manage order")}</h2><label htmlFor="quote">{t("Стоимость", "Price")}</label><input id="quote" value={quote} onChange={event => setQuote(event.target.value)} placeholder={t("Например, 20 000 ₸", "For example, 20,000 ₸")}/><label htmlFor="deadline">{t("Срок", "Timeline")}</label><input id="deadline" value={deadline} onChange={event => setDeadline(event.target.value)} placeholder={t("Например, 3–5 дней", "For example, 3–5 days")}/><label htmlFor="status">{t("Статус", "Status")}</label><select id="status" value={status} onChange={event => setStatus(event.target.value as Status)}><option value="new">{t("Новая", "New")}</option><option value="quoted">{t("Предложение", "Quoted")}</option><option value="in_progress">{t("В работе", "In progress")}</option><option value="completed">{t("Завершён", "Completed")}</option><option value="cancelled">{t("Отменён", "Cancelled")}</option></select><button className="primary-button" type="submit">{t("Сохранить изменения", "Save changes")}<Check size={18}/></button></form>;
}

function ChatPanel({ order, role, lang, send }: { order: Order; role: Role; lang: Language; send: (text: string) => void }) {
  const [text, setText] = useState("");
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    send(text.trim());
    setText("");
  }
  return <section className="panel chat-panel"><div className="chat-title"><div><MessageCircle size={20}/><h2>{t("Чат по заказу", "Order chat")}</h2></div><span>{t("Клиент ↔ администратор", "Client ↔ admin")}</span></div><div className="messages">{order.messages.length ? order.messages.map(message => <div className={message.author === role ? "message mine" : "message"} key={message.id}><small>{message.author === "admin" ? t("Администратор", "Admin") : t("Клиент", "Client")} · {formatDate(message.createdAt, lang)}</small><p>{message.text}</p></div>) : <div className="chat-empty"><Headset size={28}/><strong>{t("Начните разговор", "Start the conversation")}</strong><p>{t("Обсудите стоимость, срок и детали заказа.", "Discuss price, timeline, and order details.")}</p></div>}</div><form onSubmit={submit}><label htmlFor="chat-message">{t("Сообщение", "Message")}</label><textarea id="chat-message" rows={3} maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder={t("Напишите сообщение…", "Write a message…")}/><button className="primary-button" type="submit" disabled={!text.trim()}>{t("Отправить", "Send")}<ArrowRight size={18}/></button></form></section>;
}

function SupportPanel({ thread, role, lang, send }: { thread?: SupportThread; role: Role; lang: Language; send: (text: string) => void }) {
  const [text, setText] = useState("");
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    send(text.trim());
    setText("");
  }
  return <section className="panel chat-panel"><div className="chat-title"><div><Headset size={20}/><h2>{t("Диалог", "Conversation")}</h2></div>{thread && <span className={`status ${thread.status === "open" ? "status-in_progress" : "status-completed"}`}>{thread.status === "open" ? t("Открыт", "Open") : t("Закрыт", "Closed")}</span>}</div><div className="messages">{thread?.messages.length ? thread.messages.map(message => <div className={message.author === role ? "message mine" : "message"} key={message.id}><small>{message.author === role ? t("Вы", "You") : message.author === "admin" ? t("Поддержка", "Support") : t("Клиент", "Client")} · {formatDate(message.createdAt, lang)}</small><p>{message.text}</p></div>) : <div className="chat-empty"><Headset size={28}/><strong>{t("Чем можем помочь?", "How can we help?")}</strong><p>{t("Ваше сообщение увидит администратор.", "An admin will see your message.")}</p></div>}</div><form onSubmit={submit}><label htmlFor="support-chat-message">{t("Сообщение", "Message")}</label><textarea id="support-chat-message" rows={3} maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder={t("Напишите сообщение…", "Write a message…")}/><p className="credential-note">{t("Не отправляйте пароли или коды подтверждения.", "Do not send passwords or verification codes.")}</p><button className="primary-button" type="submit" disabled={!text.trim()}>{t("Отправить", "Send")}<ArrowRight size={18}/></button></form></section>;
}

createRoot(document.getElementById("root")!).render(<App/>);


