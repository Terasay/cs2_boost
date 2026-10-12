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
  if (!response.ok || typeof data?.id !== "string") {
    const error = new Error(`Email provider rejected delivery (HTTP ${response.status})`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get("retry-after")) || 0;
    throw error;
  }
  return data.id;
}

export function recoveryLetter(url, lang = "ru") {
  const ru = lang !== "en";
  return {
    subject: ru ? "Восстановление пароля CS2 Boost" : "Reset your CS2 Boost password",
    text: ru ? `Чтобы задать новый пароль, откройте ссылку:\n\n${url}\n\nСсылка действует 30 минут и используется один раз. Если у вас включена двухфакторная защита, также потребуется код приложения или резервный код.\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо: ваш пароль не изменён.\n\nCS2 Boost`
      : `Choose a new password using this link:\n\n${url}\n\nThe link is valid for 30 minutes and can only be used once. If two-factor protection is enabled, you will also need an authenticator or recovery code.\nIf you did not request a reset, ignore this email. Your password has not changed.\n\nCS2 Boost`,
  };
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
