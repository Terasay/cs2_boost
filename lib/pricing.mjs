export const promoCodes = ["Cherep", "Terasay"];
export const pricingVersion = 1;
export const dayMs = 86400_000;

export function normalizePromo(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 32) throw new Error("Unknown promo code");
  if (!value.trim()) return null;
  const code = promoCodes.find(code => code.toLowerCase() === value.trim().toLowerCase());
  if (!code) throw new Error("Unknown promo code");
  return code;
}

export function discountedAmount(amount, promoCode) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000000) throw new Error("Invalid price");
  const discountAmount = promoCode ? Math.round(amount * 20 / 100) : 0;
  const totalAmount = amount - discountAmount;
  return { discountAmount, totalAmount, commissionAmount: promoCode ? Math.round(totalAmount * 20 / 100) : 0 };
}

export function calculatePrice(input) {
  const promoCode = normalizePromo(input.promoCode);
  if (input.platform !== "premier" && input.platform !== "faceit") throw new Error("Choose a platform");
  if (input.service !== "rating" && input.service !== "calibration") throw new Error("Choose a service");
  if (input.redTrust !== undefined && typeof input.redTrust !== "boolean") throw new Error("Invalid trust flag");
  if (input.platform === "faceit" && input.redTrust === true) throw new Error("Red trust applies to Premier only");
  const redTrust = input.platform === "premier" && input.redTrust === true;
  if (input.service === "calibration") return { pricingVersion, promoCode, redTrust, baseAmount: null, surchargeAmount: 0, discountAmount: 0, totalAmount: null, commissionAmount: 0, durationDays: null, rate: null, unit: null };
  const { current, target } = input;
  if (!Number.isInteger(current) || !Number.isInteger(target) || current < 0 || target <= current || target > 100000) throw new Error("Enter valid ratings");
  const unit = input.platform === "premier" ? 1000 : 100;
  const threshold = input.platform === "premier" ? 10000 : 1200;
  const rate = current > threshold ? 700 : 500;
  const baseAmount = Math.round((target - current) * rate * 100 / unit);
  const surchargeAmount = redTrust ? Math.round(baseAmount * 10 / 100) : 0;
  return { pricingVersion, promoCode, redTrust, baseAmount, surchargeAmount, ...discountedAmount(baseAmount + surchargeAmount, promoCode), durationDays: Math.ceil((target - current) / unit), rate, unit };
}

export function money(amount, lang = "ru", currency = "RUB") {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100);
}
