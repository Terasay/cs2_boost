export function accessKey(): Buffer;
export function sealAccess(orderId: string, value: Record<string, string>): string;
export function openAccess(orderId: string, sealed: string): Record<string, string>;
