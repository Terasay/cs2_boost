import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { donationConnections, donationTestEvents, donationTests } from "@/db/schema";
import { accessKey } from "@/lib/order-access.mjs";
import { donationAuthorization } from "@/lib/donationalerts.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { getCurrentUser } from "../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";
import { connectionId, createPaymentTest, paymentTestStatus, processTestDonation, requireDonationTest, stateDigest, syncPaymentTests } from "./service";

const fail = (error: string, status = 400) => privateJson({ error }, status);
const expectedErrors = new Set(["DonationAlerts test mode is disabled", "Invalid DonationAlerts mode", "DonationAlerts OAuth is not configured", "Secure access is not configured", "Order not found", "Choose an accepted unpaid RUB order", "Invalid price", "Connect DonationAlerts first", "Connect the configured DonationAlerts account", "DonationAlerts API is unavailable", "DonationAlerts authorization expired. Reconnect the account", "DonationAlerts connection changed. Try again"]);
async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "admin") return fail("Admin account required", 403);
  return privateJson(paymentTestStatus());
}

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "admin") return fail("Admin account required", 403);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  if (await chargeAttempt(await rateKey("donation-test-actions", null, user.id), 60, 60000)) return fail("Too many requests. Try again later", 429);
  try {
    const config = requireDonationTest();
    const db = getDb();
    if (["create", "simulate"].includes(String(input.action)) && config.mode !== "test") return fail("Switch to test mode to run simulations", 409);
    if (input.action === "create") return privateJson({ test: createPaymentTest(user.id, input) }, 201);
    if (input.action === "connect") {
      accessKey();
      const state = randomBytes(32).toString("hex");
      const url = donationAuthorization(config, `${publicOrigin(request)}/api/payments/donationalerts/callback`, state);
      db.transaction(tx => {
        const previous = tx.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
        const changes = { stateHash: stateDigest(state), stateActor: user.id, stateExpiresAt: Date.now() + 600000, revision: (previous?.revision || 0) + 1 };
        tx.insert(donationConnections).values({ id: connectionId, ...changes }).onConflictDoUpdate({ target: donationConnections.id, set: changes }).run();
      });
      return privateJson({ url });
    }
    if (input.action === "disconnect") {
      db.transaction(tx => {
        const previous = tx.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
        if (previous) tx.update(donationConnections).set({ secret: null, accountId: null, code: null, name: null, stateHash: null, stateActor: null, stateExpiresAt: null, revision: previous.revision + 1 }).where(eq(donationConnections.id, connectionId)).run();
      });
      return privateJson({ ok: true });
    }
    if (input.action === "sync") {
      if (await chargeAttempt(await rateKey("donation-api-sync", null, connectionId), 1, 30000)) return fail("Wait 30 seconds before checking DonationAlerts again", 429);
      return privateJson({ results: await syncPaymentTests() });
    }
    if (input.action === "simulate") {
      if (typeof input.id !== "string" || !["match", "wrong_amount", "wrong_currency", "duplicate", "expired"].includes(String(input.scenario))) return fail("Invalid payment test");
      const invoice = db.select().from(donationTests).where(eq(donationTests.id, input.id)).get();
      if (!invoice) return fail("Payment test not found", 404);
      if (input.scenario === "expired") db.update(donationTests).set({ expiresAt: Date.now() - 1 }).where(eq(donationTests.id, invoice.id)).run();
      let eventId = crypto.randomUUID();
      if (input.scenario === "duplicate") {
        const previous = db.select().from(donationTestEvents).where(and(eq(donationTestEvents.testId, invoice.id), eq(donationTestEvents.source, "simulation"))).orderBy(desc(donationTestEvents.createdAt)).get();
        if (!previous) return fail("Run a simulation before replaying it");
        eventId = previous.id.split(":").slice(2).join(":");
      }
      const result = processTestDonation({ id: eventId, reference: invoice.reference, amount: input.scenario === "wrong_amount" ? invoice.amount - 1 : invoice.amount, currency: input.scenario === "wrong_currency" ? "USD" : invoice.currency }, "simulation");
      return privateJson({ result });
    }
    return fail("Invalid payment test");
  } catch (reason) { return reason instanceof Error && expectedErrors.has(reason.message) ? fail(reason.message) : fail("Payment test failed", 503); }
}

export const GET = safeApi(GETHandler);
export const POST = safeApi(POSTHandler);
