import type { Language } from "./marketing";

export const legalDetails = {
  version: "2026-10-07",
  status: "draft" as "draft" | "approved",
  operatorName: "",
  operatorAddress: "",
  operatorCountry: { ru: "Казахстан", en: "Kazakhstan" },
  hostingCountry: "",
  email: "limonorigin@gmail.com",
};

export const legalSlugs = ["terms", "privacy", "payments", "cookies"] as const;
export type LegalSlug = typeof legalSlugs[number];
export const legalLabels: Record<Language, Record<LegalSlug, string>> = {
  ru: { terms: "Пользовательское соглашение", privacy: "Политика конфиденциальности", payments: "Оплата, отмена и возвраты", cookies: "Cookies и хранение в браузере" },
  en: { terms: "Terms of use", privacy: "Privacy policy", payments: "Payments, cancellations & refunds", cookies: "Cookies & browser storage" },
};

export function isLegalSlug(value: string): value is LegalSlug {
  return legalSlugs.includes(value as LegalSlug);
}

export function legalDate(lang: Language) {
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${legalDetails.version}T00:00:00Z`));
}
