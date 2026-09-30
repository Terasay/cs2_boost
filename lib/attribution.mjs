const fields = ["source", "medium", "campaign", "content"];

export function cleanAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const field of fields) {
    const raw = value[field];
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text.length <= 80 && /^[\p{L}\p{N}_.~ -]+$/u.test(text)) result[field] = text;
  }
  return result.source ? result : null;
}

export function attributionFromQuery(query) {
  return cleanAttribution(Object.fromEntries(fields.map(field => [field, query.get(`utm_${field}`)])));
}
