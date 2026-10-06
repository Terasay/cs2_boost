"use client";

import { useState } from "react";
import { ArrowRight, Check, CreditCard, Info, LockKeyhole, MessageSquare, UsersRound } from "lucide-react";
import type { Faq, Language } from "@/lib/marketing";
import { FaqList } from "./marketing-ui";

export function ServiceObjective({ index, ru }: { index: number; ru: boolean }) {
  const start = ["4 500", "1 000", "UNRANKED"][index];
  const target = ["10 000", "1 500", "RATED"][index];
  return <div className={`service-objective objective-${index}`}>
    <small>{ru ? "ПРИМЕР ЦЕЛИ" : "EXAMPLE TARGET"}</small>
    <div className="objective-route" role="img" aria-label={`${ru ? "Пример цели" : "Example target"}: ${start} → ${target}`}><span>{start}</span><ArrowRight size={22}/><strong>{target}</strong></div>
    <div className="objective-track" aria-hidden="true">{index === 0 ? <><i/><i/><i/><i/><i/></> : index === 1 ? <><span/><span/><span/><span/><span/></> : <><span className="unranked-node"/><div/><span className="rated-node"><Check size={12}/></span></>}</div>
    <span className="objective-unit">{["PREMIER RATING", "FACEIT ELO", "PLACEMENT MATCHES"][index]}</span>
  </div>;
}

export function SecuritySection({ lang }: { lang: Language }) {
  const ru = lang === "ru";
  const items = [
    { icon: UsersRound, label: "DUO", title: ru ? "Аккаунт остаётся у вас" : "Your account stays with you", description: ru ? "Вы играете самостоятельно. Логин и пароль исполнителю не нужны." : "You play on your own account. The booster does not need your login or password." },
    { icon: LockKeyhole, label: "PILOTED", title: ru ? "Отдельная форма доступа" : "A dedicated access form", description: ru ? "Доступ согласуется до начала матчей. Данные передаются внутри заказа после подтверждения оплаты." : "Account access is agreed before the matches. Submit details inside the order after payment confirmation." },
    { icon: CreditCard, label: "PAYMENT", title: ru ? "Условия до оплаты" : "Terms before payment", description: ru ? "Цена сохраняется в заказе. Изменённые цену и срок нужно подтвердить заново." : "Your price is saved with the order. Changes to the price and duration need your approval." },
    { icon: MessageSquare, label: "COMMUNICATION", title: ru ? "Договорённости на месте" : "Your agreements in one place", description: ru ? "Чат, статус и история изменений доступны в кабинете. Для других вопросов есть отдельная поддержка." : "Chat, status and change history stay in your workspace. Other questions go to a separate support conversation." },
  ];
  return <section className="tactical-section security-section" id="security"><div className="wrap"><div className="section-heading"><div><span className="kicker">06 // ACCOUNT & ACCESS</span><h2>{ru ? "Понятные условия. Контроль доступа." : "Clear terms. Account access on your terms."}</h2></div><p>{ru ? "Что происходит с оплатой, аккаунтом и перепиской — до начала выполнения." : "Know how payment, account access and communication work before the first match."}</p></div><div className="security-grid">{items.map(({ icon: Icon, label, title, description }) => <article key={label}><div className="security-card-top"><Icon size={21}/><span>{label}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div><div className="platform-risk"><Info size={17}/><p>{ru ? "Буст и передача аккаунта могут нарушать правила площадок и привести к санкциям. Отсутствие блокировок не гарантируется. Не отправляйте пароли и коды Steam Guard в чат." : "Boosting and account sharing may violate platform rules and lead to sanctions. Freedom from account restrictions cannot be guaranteed. Do not send passwords or Steam Guard codes in chat."}</p></div></div></section>;
}

const accessQuestions: Record<Language, Faq[]> = {
  ru: [
    { question: "Что будет с моим аккаунтом?", answer: "В DUO вы играете сами и сохраняете доступ у себя. В PILOTED исполнитель получает согласованный доступ на время выполнения. Такой формат не исключает рисков, связанных с правилами Steam, CS2 и FACEIT." },
    { question: "Какие данные понадобятся?", answer: "Для совместной игры нужны профиль, регион и удобное время. Для выполнения на аккаунте доступ передаётся через отдельную форму внутри заказа после подтверждения оплаты. Не отправляйте пароль или коды Steam Guard в чат." },
    { question: "Можно ли отменить заказ?", answer: "До подтверждения оплаты заказ можно отменить в кабинете, указав причину. После оплаты обсудите отмену и возможный возврат с администратором в чате заказа." },
    { question: "Что делать, если выполнение задерживается?", answer: "Напишите в чат заказа. Администратор может перенести срок с указанием причины; изменение останется в истории. Бонус или другие условия обсуждаются отдельно. Если продолжить выполнение невозможно, согласуйте дальнейшие действия и вопрос возврата." },
    { question: "Можно ли сменить DUO на PILOTED после оформления?", answer: "Способ выполнения сохраняется при создании заказа. Если хотите его изменить, напишите администратору до начала матчей: согласуйте отмену прежней заявки и оформление новой. Не передавайте доступ к аккаунту до согласования." },
    { question: "Есть ли риск блокировки CS2 или FACEIT?", answer: "Да. Буст и передача аккаунта могут противоречить правилам площадок. Возможны ограничения аккаунта и другие санкции. Ни формат DUO, ни согласование заказа не гарантируют отсутствие блокировок." },
  ],
  en: [
    { question: "What happens to my account?", answer: "With DUO, you play yourself and keep your account access. With PILOTED, the booster receives agreed access for the delivery period. Platform risks still apply to Steam, CS2 and FACEIT." },
    { question: "What details do you need?", answer: "Duo play needs your profile, region and availability. For piloted play, submit access through the dedicated form inside your order after payment confirmation. Do not send passwords or Steam Guard codes in chat." },
    { question: "Can I cancel my order?", answer: "Before payment is confirmed, you can cancel from your workspace and provide a reason. After payment, discuss cancellation and any potential refund with the admin in your order chat." },
    { question: "What if delivery is delayed?", answer: "Contact the admin in your order chat. An admin can extend the deadline with a reason recorded in the order history. Bonuses or other arrangements are discussed separately. If delivery cannot continue, agree on next steps and discuss a refund." },
    { question: "Can I switch from DUO to PILOTED after ordering?", answer: "The playing method is saved when you create an order. To change it, contact the admin before any matches: agree on cancelling the old request and creating a new one. Do not share account access before agreeing." },
    { question: "Could my CS2 or FACEIT account be restricted?", answer: "Yes. Boosting and account sharing may violate platform rules. Account restrictions and other sanctions are possible. Neither DUO nor an agreed order guarantees freedom from restrictions." },
  ],
};

export function HomeFaq({ lang, orderQuestions }: { lang: Language; orderQuestions: Faq[] }) {
  const [topic, setTopic] = useState<"order" | "access">("order");
  const ru = lang === "ru";
  return <div className="faq-content"><div className="faq-topics" role="group" aria-label={ru ? "Тема вопросов" : "Question topic"}><button type="button" aria-pressed={topic === "order"} onClick={() => setTopic("order")}>{ru ? "Заказ и оплата" : "Order & payment"}<span>{orderQuestions.length}</span></button><button type="button" aria-pressed={topic === "access"} onClick={() => setTopic("access")}>{ru ? "Аккаунт и риски" : "Account & risks"}<span>{accessQuestions[lang].length}</span></button></div><FaqList key={topic} items={topic === "order" ? orderQuestions : accessQuestions[lang]}/></div>;
}
