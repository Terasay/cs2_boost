import { readStorage, writeStorage } from "./browser-storage";
import { attributionFromQuery, cleanAttribution } from "./attribution.mjs";

export function captureCampaign() {
  const query = new URLSearchParams(window.location.search);
  if (!query.has("utm_source")) return;
  const value = attributionFromQuery(query);
  writeStorage("sessionStorage", "cs2-campaign", value ? JSON.stringify(value) : null);
}

export function readCampaign() {
  try { return cleanAttribution(JSON.parse(readStorage("sessionStorage", "cs2-campaign") || "null")); }
  catch { return null; }
}
