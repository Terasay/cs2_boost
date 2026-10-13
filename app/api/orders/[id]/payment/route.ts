import { getCurrentUser } from "../../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { checkOrderPayment, connectionId, createOrderPayment, orderPaymentStatus, syncPaymentTests } from "../../../payments/donationalerts/service";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../../request-security";

export const POST = safeApi(async request => {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "client") return privateJson({ error: "Client account required" }, 403);
  const input = await jsonInput(request);
  if (!input) return privateJson({ error: "Invalid request" }, 400);
  if (await chargeAttempt(await rateKey("order-checkout", null, user.id), 20, 60000)) return privateJson({ error: "Too many requests. Try again later" }, 429);
  const id = new URL(request.url).pathname.split("/").at(-2)!;
  try {
    if (input.action === "check") {
      const existing = await checkOrderPayment(id, user.id);
      if (existing) return privateJson(existing);
      const retryAfter = await chargeAttempt(await rateKey("donation-api-sync", null, connectionId), 1, 30000);
      if (retryAfter) return privateJson({ checked: false, retryAfter, payment: orderPaymentStatus(id) });
      await syncPaymentTests();
      return privateJson({ checked: true, retryAfter: 30, payment: orderPaymentStatus(id) });
    }
    if (input.action !== undefined && input.action !== "prepare") return privateJson({ error: "Invalid payment action" }, 400);
    return privateJson({ intent: createOrderPayment(id, user.id, input.updatedAt) }, 201);
  }
  catch (reason) {
    const known = new Set(["Order payments are disabled", "Connect the configured DonationAlerts account", "Order not found", "Order changed. Refresh and review the latest terms", "Prepare payment first", "DonationAlerts API is unavailable", "DonationAlerts authorization expired. Reconnect the account", "DonationAlerts connection changed. Try again"]);
    if (reason instanceof Error && known.has(reason.message)) return privateJson({ error: reason.message }, reason.message === "Order not found" ? 404 : reason.message === "Prepare payment first" ? 400 : reason.message.startsWith("DonationAlerts") ? 503 : 409);
    throw reason;
  }
});
