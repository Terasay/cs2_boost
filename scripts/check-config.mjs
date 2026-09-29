import { publicOrigin } from "../lib/server-config.mjs";
import { openDatabase } from "../db/connection.mjs";

publicOrigin(new Request("http://127.0.0.1:3000"));
if (process.env.TRUST_PROXY !== "1") throw new Error("The VPS service requires TRUST_PROXY=1 and Nginx on the same server");
const database = openDatabase();
try {
  database.prepare("SELECT session_version FROM users LIMIT 1").get();
  console.log("Server configuration is valid");
} finally {
  database.close();
}
