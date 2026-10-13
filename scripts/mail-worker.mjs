import { openDatabase } from "../db/connection.mjs";
import { emailConfigured, enqueueEmail, preferences, processMailQueue } from "../lib/notifications.mjs";
import { publicOrigin } from "../lib/server-config.mjs";
import { brandedLetter } from "../lib/mail-template.mjs";

const database = openDatabase();
try {
  if (emailConfigured() && process.env.EMAIL_MONITOR !== "0") {
    const now = Date.now();
    const port = Number(process.env.INTERNAL_PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid internal server port");
    let healthy = false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000), redirect: "error" });
      healthy = response.ok && (await response.json()).ok === true;
    } catch {}
    database.transaction(() => {
      const saved = database.prepare("SELECT value FROM service_state WHERE key = 'health'").get();
      const state = saved ? JSON.parse(saved.value) : { failures: 0, outage: null };
      state.failures = healthy ? 0 : state.failures + 1;
      const event = !healthy && state.failures >= 3 && !state.outage ? "down" : healthy && state.outage ? "up" : null;
      if (event === "down") state.outage = now;
      if (event) {
        const origin = publicOrigin(new Request(`http://127.0.0.1:${port}`));
        for (const admin of database.prepare("SELECT id FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL").all()) {
          const ru = preferences(database, admin.id).language === "ru";
          const title = event === "down" ? (ru ? "Сайт CS2 Boost не отвечает" : "CS2 Boost is unavailable") : (ru ? "Сайт CS2 Boost снова доступен" : "CS2 Boost is available again");
          enqueueEmail(database, { key: `health:${state.outage}:${event}:${admin.id}`, userId: admin.id, kind: "service",
            letter: brandedLetter({ lang: ru ? "ru" : "en", title, kicker: ru ? "СОСТОЯНИЕ СЕРВИСА" : "SERVICE STATUS", action: { text: ru ? "Открыть сайт" : "Open website", url: origin },
              paragraphs: [event === "down" ? (ru ? "Проверка приложения завершилась ошибкой три раза подряд. Проверьте сервис cs2-boost и журнал systemd на VPS." : "The application health check failed three consecutive times. Check the cs2-boost service and systemd logs on the VPS.") : (ru ? "Проверка приложения снова проходит успешно." : "The application health check is successful again.")],
              subject: title, text: `${title}.\n\n${event === "down" ? (ru ? "Проверка приложения завершилась ошибкой три раза подряд. Проверьте сервис cs2-boost и журнал systemd на VPS." : "The application health check failed three consecutive times. Check the cs2-boost service and systemd logs on the VPS.") : (ru ? "Проверка приложения снова проходит успешно." : "The application health check is successful again.")}\n${origin}\n\nCS2 Boost` }) });
        }
      }
      if (healthy) state.outage = null;
      database.prepare("INSERT INTO service_state (key, value) VALUES ('health', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(state));
    })();
  }
  console.log(JSON.stringify(await processMailQueue(database)));
} finally {
  database.close();
}
