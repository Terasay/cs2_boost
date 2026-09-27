import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const ITERATIONS = 600_000;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const bytes = new TextEncoder().encode(password);
  try {
    const key = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveBits"]);
    const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
    return hex(new Uint8Array(hash));
  } catch (error) {
    if (!(error instanceof Error) || (error.name !== "NotSupportedError" && !/iteration.*not supported/i.test(error.message))) throw error;
    return hex(await pbkdf2Async(sha256, bytes, salt, { c: iterations, dkLen: 32 }));
  }
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${ITERATIONS}:${hex(salt)}:${await derive(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 2 && parts.length !== 3) return false;
  const iterations = parts.length === 3 ? Number(parts[0]) : 210_000;
  const [salt, expected] = parts.slice(-2);
  if (![210_000, ITERATIONS].includes(iterations) || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  const actual = await derive(password, Uint8Array.from(salt.match(/../g)!, part => parseInt(part, 16)), iterations);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}

export function needsPasswordUpgrade(stored: string) {
  return !stored.startsWith(`${ITERATIONS}:`);
}