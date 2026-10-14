"use client";

import { useEffect, useState } from "react";
import { normalizePromo, type Promo } from "@/lib/pricing.mjs";
import { api, ApiError } from "./account-ui";

export function usePromo(value: string) {
  const key = value.trim().toUpperCase();
  let standard: string | null = null;
  try { standard = normalizePromo(value); } catch {}
  const [resolved, setResolved] = useState<{ key: string; promo: Promo | null; unavailable?: boolean } | null>(null);
  const needsLookup = Boolean(key && !standard && /^[A-Z0-9-]{3,32}$/.test(key));
  useEffect(() => {
    if (!needsLookup) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api<{ promo: Promo | null }>(`/api/promos/resolve?code=${encodeURIComponent(key)}`, { signal: abort.signal })
        .then(result => { if (!abort.signal.aborted) setResolved({ key, promo: result.promo }); })
        .catch(reason => { if (!abort.signal.aborted) setResolved({ key, promo: null, unavailable: !(reason instanceof ApiError && reason.status === 400) }); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [key, needsLookup]);
  return {
    promo: standard ? { code: standard, discountPercent: 20, commissionPercent: 20 } : resolved?.key === key ? resolved.promo : null,
    checking: needsLookup && resolved?.key !== key,
    unavailable: !standard && resolved?.key === key && resolved.unavailable === true,
  };
}
