import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] || "/etc/cs2-boost.env";
if (lstatSync(path).isSymbolicLink()) throw new Error("Environment file must not be a symlink");
const source = readFileSync(path, "utf8");
let updated = source;
for (const name of ["ORDER_ACCESS_KEY", "TWO_FACTOR_KEY", "PAYMENTS_SYNC_KEY"]) {
  const lines = updated.split(/\r?\n/);
  const matching = lines.filter(line => line.startsWith(`${name}=`));
  if (matching.length > 1) throw new Error(`Duplicate ${name} entries`);
  const value = matching[0]?.slice(name.length + 1).trim() || "";
  if (value && !/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${name} must be a 64-character hexadecimal key`);
  if (!value) {
    const setting = `${name}=${randomBytes(32).toString("hex")}`;
    updated = matching.length ? lines.map(line => line.startsWith(`${name}=`) ? setting : line).join("\n") : `${updated.trimEnd()}\n${setting}\n`;
    console.log(`${name} created in the server environment file`);
  } else console.log(`Existing ${name} preserved`);
}
if (updated !== source) writeFileSync(path, updated);
if (process.platform !== "win32") chmodSync(path, 0o640);
