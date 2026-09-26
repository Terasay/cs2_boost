import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_SECONDS = 60 * 60 * 24 * 7;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("Invalid hash");
  return Uint8Array.from(hex.match(/../g)!, (part) => parseInt(part, 16));
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 210_000 }, key, 256);
  return bytesToHex(new Uint8Array(hash));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${bytesToHex(salt)}:${await derive(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHex] = stored.split(":");
  if (!saltHex || !expectedHex) return false;
  const actual = await derive(password, hexToBytes(saltHex));
  if (actual.length !== expectedHex.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return difference === 0;
}

async function digest(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function createSession(userId: string, request: Request): Promise<string> {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await getDb().insert(sessions).values({ id: await digest(token), userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `cs2_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `cs2_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export async function getCurrentUser(request: Request) {
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)cs2_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  if (!cookie) return null;
  const [session] = await getDb().select().from(sessions).where(eq(sessions.id, await digest(cookie))).limit(1);
  if (!session || session.expiresAt < Date.now()) return null;
  const [user] = await getDb().select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function deleteSession(request: Request): Promise<void> {
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)cs2_session=([0-9a-f]{64})(?:;|$)/)?.[1];
  if (cookie) await getDb().delete(sessions).where(eq(sessions.id, await digest(cookie)));
}
