export function mailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured");
  if (!/^re_[a-zA-Z0-9_-]+$/.test(apiKey) || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(from)) throw new Error("Invalid email configuration");
  return { apiKey, from };
}

export async function sendEmail({ to, subject, text, idempotencyKey }) {
  const { apiKey, from } = mailConfig();
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: `CS2 Boost <${from}>`, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
  } catch { throw new Error("Email provider connection failed"); }
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.id !== "string") throw new Error(`Email provider rejected delivery (HTTP ${response.status})`);
  return data.id;
}

export function verificationLetter(url, lang = "ru") {
  return lang === "en" ? {
    subject: "Complete your CS2 Boost registration",
    text: `Complete your registration and set your password:\n\n${url}\n\nThe link is valid for 30 minutes. It can only be used once.\nIf you did not request an account, ignore this email. Your account has not been created.\n\nCS2 Boost`,
  } : {
    subject: "Подтвердите почту для регистрации в CS2 Boost",
    text: `Чтобы завершить регистрацию и задать пароль, откройте ссылку:\n\n${url}\n\nСсылка действует 30 минут и используется один раз.\nЕсли вы не регистрировались, просто проигнорируйте письмо. Аккаунт ещё не создан.\n\nCS2 Boost`,
  };
}
