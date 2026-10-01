export const promoCodes: string[];
export const pricingVersion: number;
export const dayMs: number;
export type PriceInput = { platform: "premier" | "faceit"; service: "rating" | "calibration"; current: number | null; target: number | null; redTrust?: boolean; promoCode?: string | null };
export type Price = { pricingVersion: number; promoCode: string | null; redTrust: boolean; baseAmount: number | null; surchargeAmount: number; discountAmount: number; totalAmount: number | null; commissionAmount: number; durationDays: number | null; rate: number | null; unit: number | null };
export function normalizePromo(value: unknown): string | null;
export function discountedAmount(amount: number, promoCode: string | null): { discountAmount: number; totalAmount: number; commissionAmount: number };
export function calculatePrice(input: PriceInput): Price;
export function money(amount: number, lang?: "ru" | "en", currency?: string): string;
