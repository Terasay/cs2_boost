import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] || "/etc/cs2-boost.env";
if (lstatSync(path).isSymbolicLink()) throw new Error("Environment file must not be a symlink");
const source = readFileSync(path, "utf8");
const lines = source.split(/\r?\n/);
const matching = lines.filter(line => /^ORDER_ACCESS_KEY=/.test(line));
if (matching.length > 1) throw new Error("Duplicate ORDER_ACCESS_KEY entries");
const value = matching[0]?.slice("ORDER_ACCESS_KEY=".length).trim() || "";
if (value && !/^[a-f0-9]{64}$/i.test(value)) throw new Error("ORDER_ACCESS_KEY must be a 64-character hexadecimal key");
if (!value) {
  const setting = `ORDER_ACCESS_KEY=${randomBytes(32).toString("hex")}`;
  const updated = matching.length ? lines.map(line => /^ORDER_ACCESS_KEY=/.test(line) ? setting : line).join("\n") : `${source.trimEnd()}\n${setting}\n`;
  writeFileSync(path, updated);
  console.log("Order access encryption key created in the server environment file");
} else console.log("Existing order access encryption key preserved");
if (process.platform !== "win32") chmodSync(path, 0o640);
