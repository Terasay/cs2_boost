import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [emailArg, mode] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || (mode && mode !== "--remote")) {
  throw new Error("Usage: node scripts/set-admin.mjs email@example.com [--remote]");
}
if (!existsSync("dist/server/wrangler.json")) throw new Error("Run npm run build first");

const escaped = email.replaceAll("'", "''");
const scope = mode === "--remote" ? ["--remote"] : ["--local", "--persist-to", ".wrangler/state"];
function query(command) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--config", "dist/server/wrangler.json", ...scope, "--command", command, "--json", "--yes"], {
    encoding: "utf8",
    env: { ...process.env, XDG_CONFIG_HOME: resolve(".wrangler/config") },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "D1 command failed");
  const start = result.stdout.indexOf("[\n");
  if (start < 0) throw new Error("Unexpected D1 response");
  const data = JSON.parse(result.stdout.slice(start));
  if (!data[0]?.success) throw new Error("D1 command failed");
  return data[0];
}

const account = query(`SELECT id, role FROM users WHERE email = '${escaped}'`).results?.[0];
if (!account) throw new Error("Create the account with this email first");
if (account.role !== "admin") {
  query(`UPDATE users SET role = 'admin' WHERE email = '${escaped}'`);
  query(`DELETE FROM sessions WHERE user_id = '${account.id.replaceAll("'", "''")}'`);
}
console.log(`${email} is admin in ${mode === "--remote" ? "remote" : "local"} D1. Sign in again.`);
