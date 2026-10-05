import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node.js 24 is required");
  for (const name of ["next","typescript","drizzle-orm","qrcode"]) require.resolve(name);
  require("@tailwindcss/postcss");
  require("unrs-resolver");
  const tooling = createRequire(require.resolve("drizzle-kit"));
  tooling("esbuild").transformSync("const ready = true;");
  const next = createRequire(require.resolve("next/package.json"));
  await next("sharp")({ create: { width: 1, height: 1, channels: 3, background: "black" } }).png().toBuffer();
  const Database = require("better-sqlite3");
  const database = new Database(":memory:");
  try { database.prepare("SELECT 1").get(); } finally { database.close(); }
} catch (error) {
  console.error("Installed dependencies are incomplete or incompatible with this Node.js runtime.");
  console.error(error.message);
  process.exitCode = 1;
}
