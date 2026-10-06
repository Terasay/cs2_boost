import type { Language } from "@/lib/marketing";
import { legalLabels } from "@/lib/legal-config";

export function LegalFormLinks({ lang, order = false }: { lang: Language; order?: boolean }) {
  const ru = lang === "ru";
  return <p className="form-documents">{ru ? (order ? "Перед оформлением ознакомьтесь: " : "Перед отправкой email ознакомьтесь: ") : (order ? "Before ordering, review: " : "Before submitting your email, review: ")}<a href={`/${lang}/legal/terms`} target="_blank" rel="noopener noreferrer">{legalLabels[lang].terms}</a>, <a href={`/${lang}/legal/privacy`} target="_blank" rel="noopener noreferrer">{legalLabels[lang].privacy}</a>{order && <>, <a href={`/${lang}/legal/payments`} target="_blank" rel="noopener noreferrer">{legalLabels[lang].payments}</a></>}. <span>{ru ? "Откроются в новой вкладке." : "Links open in a new tab."}</span></p>;
}
