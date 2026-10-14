import type Database from "better-sqlite3";
import type { Promo } from "./pricing.mjs";
export function resolvePromo(db: Database.Database, value: unknown, buyerId?: string | null): (Promo & { ownerId: string | null }) | null;
export function claimPersonalPromo(db: Database.Database, userId: string): string;
export function walletBalance(db: Database.Database, userId: string): number;
export function changeWallet(db: Database.Database, input: { userId: string; reference: string; kind: string; amount: number; orderId?: string | null; allowDebt?: boolean; now?: number }): boolean;
export function creditReferral(db: Database.Database, orderId: string, now?: number): boolean;
export function reverseOrderWallet(db: Database.Database, orderId: string, now?: number): void;
