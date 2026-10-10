import { accessKey, openAccess, sealAccess } from "./order-access.mjs";

const context = (kind, parentId, id) => `chat:${kind}:${parentId}:${id}`;

export function sealChat(kind, parentId, id, body) {
  return sealAccess(context(kind, parentId, id), { body });
}

export function openChat(kind, parentId, id, payload, encrypted) {
  if (!encrypted) return payload;
  const value = openAccess(context(kind, parentId, id), payload);
  if (typeof value.body !== "string") throw new Error("Invalid encrypted message");
  return value.body;
}

export function encryptExistingChats(database) {
  const tables = [["messages", "order_id", "order"], ["support_messages", "thread_id", "support"]];
  const count = tables.reduce((total, [table]) => total + database.prepare(`SELECT count(*) AS n FROM ${table} WHERE encrypted = 0`).get().n, 0);
  if (!count) return 0;
  accessKey();
  database.transaction(() => {
    for (const [table, parent, kind] of tables) {
      const select = database.prepare(`SELECT id, ${parent} AS parentId, body FROM ${table} WHERE encrypted = 0 LIMIT 100`);
      const update = database.prepare(`UPDATE ${table} SET body = ?, encrypted = 1 WHERE id = ? AND encrypted = 0`);
      for (;;) {
        const rows = select.all();
        if (!rows.length) break;
        for (const row of rows) update.run(sealChat(kind, row.parentId, row.id, row.body), row.id);
      }
    }
  })();
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
  database.pragma("wal_checkpoint(TRUNCATE)");
  return count;
}
