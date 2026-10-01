import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function accessKey() {
  const key = process.env.ORDER_ACCESS_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("Secure access is not configured");
  return Buffer.from(key, "hex");
}

export function sealAccess(orderId, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accessKey(), iv);
  cipher.setAAD(Buffer.from(orderId));
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), payload.toString("base64")].join(".");
}

export function openAccess(orderId, sealed) {
  const [version, iv, tag, payload, extra] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !payload || extra) throw new Error("Access data unavailable");
  const decipher = createDecipheriv("aes-256-gcm", accessKey(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(orderId));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8"));
}
