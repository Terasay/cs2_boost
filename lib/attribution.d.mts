export type Attribution = { source: string; medium?: string; campaign?: string; content?: string };
export function cleanAttribution(value: unknown): Attribution | null;
export function attributionFromQuery(query: URLSearchParams): Attribution | null;
