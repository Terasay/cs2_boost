import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { publicOrigin } from "@/lib/server-config.mjs";
import { privateJson, safeApi } from "../request-security";

export const dynamic = "force-dynamic";
export const GET = safeApi(async request => {
  publicOrigin(request);
  getDb().get(sql`select id from users limit 1`);
  return privateJson({ ok: true });
});
