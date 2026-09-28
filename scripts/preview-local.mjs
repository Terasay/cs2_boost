import { readdirSync } from "node:fs";
import path from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_getMiniflareWorkerOptions } from "wrangler";

const portIndex = process.argv.indexOf("--port");
const port = portIndex === -1 ? 8787 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a port between 1024 and 65535");
const { workerOptions, main } = unstable_getMiniflareWorkerOptions("dist/server/wrangler.json");
if (!main) throw new Error("Run npm run build before npm start");
const root = path.dirname(main);
const files = readdirSync(root, { recursive: true }).filter(file => file.endsWith(".js") || file.endsWith(".mjs")).map(file => path.join(root, file));
const modules = [main, ...files.filter(file => file !== main)].map(file => ({ type: "ESModule", path: file }));
delete workerOptions.modulesRules;
const server = new Miniflare(convertV4MiniflareOptions({
  ...workerOptions,
  modules,
  modulesRoot: root,
  host: "127.0.0.1",
  port,
  cf: false,
  resourcePersistencePath: path.resolve(".wrangler/state/v3"),
  resourceTmpPath: path.resolve(".wrangler/tmp-preview"),
}));
console.log(`Local preview: ${await server.ready}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.dispose();
  process.exit(0);
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
