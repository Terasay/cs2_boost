import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders, users } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { chargeAttempt, rateKey } from "../auth/rate-limit";
import { jsonInput, privateJson, sameOriginMutation } from "../request-security";

const fail = (error: string, status = 400) => privateJson({ error }, status);

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const db = getDb();
  const all = await db.select({
    id: orders.id, platform: orders.platform, service: orders.service, method: orders.method,
    currentRating: orders.currentRating, targetRating: orders.targetRating, status: orders.status,
    quotedPrice: orders.quotedPrice, quotedCurrency: orders.quotedCurrency, deadline: orders.deadline,
    createdAt: orders.createdAt, email: users.email,
  }).from(orders).innerJoin(users, eq(orders.userId, users.id))
    .where(user.role === "admin" ? undefined : eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt)).limit(100);
  return privateJson({ orders: all });
}

export async function POST(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "client") return fail("Client account required", 403);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const { platform, service, method } = input;
  if (platform !== "premier" && platform !== "faceit") return fail("Choose a platform");
  if (service !== "rating" && service !== "calibration") return fail("Choose a service");
  if (method !== "duo" && method !== "piloted") return fail("Choose a method");
  if (input.riskAccepted !== true) return fail("Risk acknowledgement is required");
  let currentRating: number | null = null, targetRating: number | null = null;
  if (service === "rating") {
    currentRating = Number(input.current);
    targetRating = Number(input.target);
    if (!Number.isInteger(currentRating) || !Number.isInteger(targetRating) || currentRating < 0 || targetRating <= currentRating || targetRating > 100000) return fail("Enter valid ratings");
  }
  const retry = await chargeAttempt(await rateKey("order", request, user.id), 10, 60 * 60_000);
  if (retry) return fail("Too many requests. Try again later", 429);
  const now = Date.now();
  const id = crypto.randomUUID();
  await getDb().insert(orders).values({ id, userId: user.id, platform, service, method, currentRating, targetRating, status: "new", riskAcceptedAt: now, createdAt: now, updatedAt: now });
  return privateJson({ id }, 201);
}
