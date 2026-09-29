import { isIP } from "node:net";

export function publicOrigin(request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("APP_ORIGIN is required in production");
  const url = new URL(configured || request.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (configured && (url.pathname !== "/" || url.search || url.hash))) {
    throw new Error("APP_ORIGIN must contain only the protocol and host");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && process.env.ALLOW_HTTP_TESTING !== "1") {
    throw new Error("HTTPS is required. ALLOW_HTTP_TESTING=1 is only for temporary testing with disposable accounts");
  }
  return url.origin;
}

export function clientIp(request) {
  if (process.env.TRUST_PROXY !== "1") return "local";
  const value = request.headers.get("x-real-ip");
  if (!value || !isIP(value)) throw new Error("Trusted proxy did not supply a valid X-Real-IP");
  return isIP(value) === 6 ? new URL(`http://[${value}]`).hostname.slice(1, -1) : value;
}
