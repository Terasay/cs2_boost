import { permanentRedirect } from "next/navigation";

export default async function HomeRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  const input = await searchParams;
  for (const key of ["platform", "service", "promo", "utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const value = input[key];
    if (typeof value === "string" && value.length <= (key === "promo" ? 32 : 100)) query.set(key, value);
  }
  permanentRedirect("/ru" + (query.size ? "?" + query.toString() : ""));
}
