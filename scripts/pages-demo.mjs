import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (!["dev","build","preview"].includes(action)) throw new Error("Choose dev, build or preview");
const root = dirname(fileURLToPath(new URL("../pages-demo/package.json",import.meta.url)));
const marker = join(root,"node_modules/.cs2-dependencies");
const fingerprint = createHash("sha256").update(readFileSync(join(root,"package.json"))).update(readFileSync(join(root,"package-lock.json"))).update(`${process.versions.modules}:${process.platform}:${process.arch}`).digest("hex");
const npmPath = process.env.npm_execpath;
if (!npmPath) throw new Error("Run the demo through npm run dev:pages, build:pages or preview:pages");
const run = args => {
  const result = spawnSync(process.execPath,[npmPath,...args],{cwd:root,stdio:"inherit",windowsHide:true});
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!existsSync(marker) || readFileSync(marker,"utf8").trim() !== fingerprint) {
  run(["ci","--ignore-scripts","--prefer-offline","--no-audit","--no-fund"]);
  writeFileSync(marker,fingerprint);
}
run(["run",action,"--",...process.argv.slice(3)]);
