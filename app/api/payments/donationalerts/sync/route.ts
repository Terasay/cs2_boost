import { timingSafeEqual } from "node:crypto";
import { donationConfig } from "@/lib/donationalerts.mjs";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { privateJson, safeApi } from "../../../request-security";
import { connectionId, paymentTestStatus, syncPaymentTests } from "../service";

export const POST = safeApi(async request => {
  const expected = process.env.PAYMENTS_SYNC_KEY || "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1] || "";
  if (!/^[a-f0-9]{64}$/i.test(expected) || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return privateJson({ error: "Unauthorized" }, 401);
  if (donationConfig().mode !== "orders" || !paymentTestStatus().connected) return privateJson({ skipped: true });
  if (await chargeAttempt(await rateKey("donation-api-sync", null, connectionId), 1, 30000)) return privateJson({ skipped: true });
  return privateJson({ results: await syncPaymentTests() });
});
