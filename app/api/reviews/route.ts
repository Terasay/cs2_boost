import { publicReviews } from "@/lib/reviews";
import { privateJson, safeApi } from "../request-security";

export const GET = safeApi(async request => {
  const value = new URL(request.url).searchParams.get("page") || "1";
  if (!/^[1-9]\d{0,5}$/.test(value)) return privateJson({ error: "Invalid page" }, 400);
  return privateJson(publicReviews(Number(value)));
});
