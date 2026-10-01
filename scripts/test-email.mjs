import { randomUUID } from "node:crypto";
import { sendEmail } from "../lib/mail.mjs";

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
  console.error("Usage: node scripts/test-email.mjs your-email@example.com");
  process.exitCode = 1;
} else {
  try {
    const id = await sendEmail({ to, subject: "CS2 Boost — проверка почты", text: "Отправка писем с сервера CS2 Boost настроена. Это тестовое письмо, подтверждать аккаунт по нему не нужно.", idempotencyKey: `mail-test-${randomUUID()}` });
    console.log(`Resend accepted the test email. Message ID: ${id}. Check your inbox and the delivery status in Resend.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Email test failed");
    process.exitCode = 1;
  }
}
