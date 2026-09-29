import { drizzle } from "drizzle-orm/better-sqlite3";
import { openDatabase } from "./connection.mjs";
import * as schema from "./schema";

const createDb = () => drizzle(openDatabase(), { schema });
const state = globalThis as typeof globalThis & { cs2Database?: ReturnType<typeof createDb> };

export function getDb() {
  return state.cs2Database ??= createDb();
}
