import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 210_000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error("Invalid hash");
  return Uint8Array.from(hex.match(/../g)!, (part) => parseInt(part, 16));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return bytesToHex(new Uint8Array(hash));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PASSWORD_ITERATIONS}:${bytesToHex(salt)}:${await derive(password, salt, PASSWORD_ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  const iterations = parts.length === 3 ? Number(parts[0]) : LEGACY_ITERATIONS;
  const [saltHex, expectedHex] = parts.length === 3 ? parts.slice(1) : parts;
  if (!saltHex || !expectedHex || !Number.isInteger(iterations) || iterations < LEGACY_ITERATIONS || iterations > 1_000_000) return false;
  const actual = await derive(password, hexToBytes(saltHex), iterations);
  if (actual.length !== expectedHex.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return difference === 0;
}

export function needsPasswordUpgrade(stored: string) {
  return !stored.startsWith(`${PASSWORD_ITERATIONS}:`);
}

async function digest(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function createSession(userId: string, request: Request): Promise<string> {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
  await db.insert(sessions).values({ id: await digest(token), userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  const secure = new URL(request.url).protocol === "https:";
  return `${secure ? "__Host-cs2_session" : "cs2_session"}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${secure ? "__Host-cs2_session" : "cs2_session"}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sessionToken(request: Request) {
  const name = new URL(request.url).protocol === "https:" ? "__Host-cs2_session" : "cs2_session";
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]{64})(?:;|$)`))?.[1];
}

export async function getCurrentUser(request: Request) {
  const cookie = sessionToken(request);
  if (!cookie) return null;
  const [session] = await getDb().select().from(sessions).where(eq(sessions.id, await digest(cookie))).limit(1);
  if (!session || session.expiresAt < Date.now()) return null;
  const [user] = await getDb().select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function deleteSession(request: Request): Promise<void> {
  const cookie = sessionToken(request);
  if (cookie) await getDb().delete(sessions).where(eq(sessions.id, await digest(cookie)));
}

export async function deleteAllSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}
