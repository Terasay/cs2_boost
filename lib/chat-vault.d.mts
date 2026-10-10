import type Database from "better-sqlite3";
export function sealChat(kind: "order" | "support", parentId: string, id: string, body: string): string;
export function openChat(kind: "order" | "support", parentId: string, id: string, payload: string, encrypted: boolean | number): string;
export function encryptExistingChats(database: Database.Database): number;
