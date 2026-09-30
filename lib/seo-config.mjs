import { isIP } from "node:net";

export function siteOrigin() {
  try {
    const value = new URL(process.env.APP_ORIGIN || "");
    if (value.protocol !== "https:" || value.username || value.password || value.pathname !== "/" || value.search || value.hash) return null;
    const host = value.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) || !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".test")) return null;
    return value.origin;
  } catch { return null; }
}

export function searchEnabled() { return process.env.SEARCH_INDEXING === "1" && siteOrigin() !== null; }
