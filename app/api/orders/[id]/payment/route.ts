import { getCurrentUser } from "../../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { createOrderPayment } from "../../../payments/donationalerts/service";
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
  try { return privateJson({ intent: createOrderPayment(id, user.id, input.updatedAt) }, 201); }
  catch (reason) {
    const known = new Set(["Order payments are disabled", "Connect the configured DonationAlerts account", "Order not found", "Order changed. Refresh and review the latest terms"]);
    if (reason instanceof Error && known.has(reason.message)) return privateJson({ error: reason.message }, reason.message === "Order not found" ? 404 : 409);
    throw reason;
  }
});
