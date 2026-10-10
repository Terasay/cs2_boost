import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { donationConnections } from "@/db/schema";
import { donationProfile, donationToken } from "@/lib/donationalerts.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { getCurrentUser } from "../../../auth/auth-lib";
import { privateJson, safeApi } from "../../../request-security";
import { connectionId, requireDonationTest, sealDonationTokens, stateDigest } from "../service";

async function GETHandler(request: Request) {
  const origin = publicOrigin(request);
  const finish = (result: string) => new Response(null, { status: 303, headers: { Location: `${origin}/payments?connection=${result}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  const user = await getCurrentUser(request);
  if (!user || user.role !== "admin") return privateJson({ error: "Admin account required" }, 403);
  const query = new URL(request.url).searchParams;
  const state = query.get("state") || "";
  if (!/^[a-f0-9]{64}$/.test(state)) return finish("expired");
  const db = getDb();
  const connection = db.transaction(tx => {
    const stored = tx.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
    if (!stored || stored.stateHash !== stateDigest(state) || stored.stateActor !== user.id || !stored.stateExpiresAt || stored.stateExpiresAt < Date.now()) return null;
    tx.update(donationConnections).set({ stateHash: null, stateActor: null, stateExpiresAt: null, revision: stored.revision + 1 }).where(eq(donationConnections.id, connectionId)).run();
    return { ...stored, revision: stored.revision + 1 };
  });
  if (!connection) return finish("expired");
  if (query.has("error")) return finish("cancelled");
  const code = query.get("code");
  if (!code || code.length > 8192) return finish("failed");
  try {
    const config = requireDonationTest();
    const tokens = await donationToken(config, { grant_type: "authorization_code", code, redirect_uri: `${origin}/api/payments/donationalerts/callback` });
    const profile = await donationProfile(tokens.accessToken, config.account);
    const stillAdmin = await getCurrentUser(request);
    if (!stillAdmin || stillAdmin.role !== "admin") return finish("failed");
    const saved = db.update(donationConnections).set({ secret: sealDonationTokens(tokens), ...profile, revision: connection.revision + 1 }).where(and(eq(donationConnections.id, connectionId), eq(donationConnections.revision, connection.revision))).run();
    return finish(saved.changes ? "connected" : "expired");
  } catch { return finish("failed"); }
}

export const GET = safeApi(GETHandler);
