import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { clearSessionCookie, createSession, deleteSession, getCurrentUser, hashPassword, verifyPassword } from "../auth-lib";

const fail = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function GET(request: Request) {
  if (new URL(request.url).pathname.endsWith("/me")) return Response.json({ user: await getCurrentUser(request) });
  return fail("Not found", 404);
}

export async function POST(request: Request) {
  const action = new URL(request.url).pathname.split("/").pop();
  if (action === "logout") {
    await deleteSession(request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
  }
  if (action !== "register" && action !== "login") return fail("Not found", 404);

  let input: { email?: unknown; password?: unknown };
  try { input = await request.json(); } catch { return fail("Invalid request"); }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email");
  if (password.length < 10 || password.length > 128) return fail("Password must be 10–128 characters");

  const db = getDb();
  let user: { id: string; email: string; role: "client" | "admin" };
  if (action === "register") {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return fail("This email is already registered", 409);
    const [first] = await db.select({ id: users.id }).from(users).limit(1);
    const role = !first && request.headers.get("oai-authenticated-user-id") ? "admin" : "client";
    const id = crypto.randomUUID();
    try {
      await db.insert(users).values({ id, email, passwordHash: await hashPassword(password), role, createdAt: Date.now() });
    } catch { return fail("This email is already registered", 409); }
    user = { id, email, role };
  } else {
    const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!found || !(await verifyPassword(password, found.passwordHash))) return fail("Incorrect email or password", 401);
    user = { id: found.id, email: found.email, role: found.role };
  }
  const cookie = await createSession(user.id, request);
  return Response.json({ user }, { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
