import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function twoFactorKey() {
  const value = process.env.TWO_FACTOR_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("Two-factor protection is not configured");
  return Buffer.from(value, "hex");
}

export function base32(bytes) {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decode32(secret) {
  if (!/^[A-Z2-7]+$/.test(secret)) throw new Error("Invalid authenticator secret");
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export const generateSecret = () => base32(randomBytes(20));

export function totp(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", decode32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, "0");
}

export function verifyTotp(secret, code, lastStep = -1, now = Date.now()) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export function authenticatorUri(email, secret) {
  return `otpauth://totp/${encodeURIComponent(`CS2 BOOST:${email}`)}?${new URLSearchParams({ secret, issuer: "CS2 BOOST", algorithm: "SHA1", digits: "6", period: "30" })}`;
}

export function sealSecret(userId, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", twoFactorKey(), iv);
  cipher.setAAD(Buffer.from(`cs2-totp:${userId}`));
  const payload = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), payload.toString("base64")].join(".");
}

export function openSecret(userId, sealed) {
  const [version, iv, tag, payload, extra] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !payload || extra) throw new Error("Authenticator unavailable");
  const decipher = createDecipheriv("aes-256-gcm", twoFactorKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`cs2-totp:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{4}/g).join("-"));
}

export function recoveryHash(userId, code) {
  if (typeof code !== "string" || code.length > 32) return null;
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{20}$/.test(normalized) ? tokenHash(`recovery:${userId}:${normalized}`) : null;
}

export const tokenHash = value => createHash("sha256").update(value).digest("hex");
