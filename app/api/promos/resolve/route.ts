import { getDb } from "@/db";
import { resolvePromo } from "@/lib/wallet.mjs";
import { privateJson, safeApi } from "../../request-security";

export const GET = safeApi(async request => {
  try {
    const promo = resolvePromo(getDb().$client, new URL(request.url).searchParams.get("code"));
    return privateJson({ promo: promo ? { code: promo.code, discountPercent: promo.discountPercent, commissionPercent: promo.commissionPercent } : null });
  } catch { return privateJson({ error: "Unknown promo code" }, 400); }
});
