const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function link(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function paragraph(value) {
  return String(value).split(/(https?:\/\/[^\s<>]+)/g).map(part => {
    const url = link(part);
    return url ? `<a href="${escape(url)}" style="color:#9a5a00;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escape(part)}</a>` : escape(part).replace(/\n/g, "<br>");
  }).join("");
}

export function emailHtml({ subject, text, lang, title = subject, kicker, paragraphs, action, notice, footnote, settingsUrl, showLink = false }) {
  const ru = lang ? lang !== "en" : /[а-яё]/i.test(subject + text);
  const language = ru ? "ru" : "en";
  const firstUrl = link(String(text).match(/https?:\/\/[^\s<>]+/)?.[0]);
  const actionUrl = link(action?.url);
  const configuredOrigin = link(process.env.APP_ORIGIN?.trim());
  const origin = new URL(actionUrl || firstUrl || configuredOrigin || "https://cs2-boosts.ru").origin;
  const settings = link(settingsUrl);
  const copy = paragraphs || String(text).trim().split(/\n\s*\n/).filter(part => part !== "CS2 Boost");
  const preview = copy[0] || title;
  const button = actionUrl ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;"><tr><td align="center" bgcolor="#f5a021" style="background:#f5a021;border-radius:4px;"><a class="email-button" href="${escape(actionUrl)}" style="display:block;padding:17px 24px;border:1px solid #f5a021;border-radius:4px;color:#15191e;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;text-align:center;">${escape(action.text)}</a></td></tr></table>` : "";
  const backup = actionUrl && showLink ? `<p style="margin:24px 0 8px;color:#647080;font-size:12px;line-height:19px;">${ru ? "Если кнопка не работает, скопируйте ссылку в браузер:" : "If the button does not work, copy this link into your browser:"}</p><p style="margin:0;font-size:12px;line-height:19px;word-break:break-all;overflow-wrap:anywhere;"><a href="${escape(actionUrl)}" style="color:#9a5a00;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escape(actionUrl)}</a></p>` : "";
  return `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(subject)}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media(max-width:600px){.email-outer{padding:20px 12px!important}.email-content{padding:28px 22px!important}.email-header{padding:24px 22px!important}.email-title{font-size:26px!important;line-height:33px!important}.email-footer{padding:24px 22px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background:#edf0f3;color:#202833;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">${escape(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#edf0f3"><tr><td class="email-outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #d8dee6;">
<tr><td height="4" bgcolor="#f5a021" style="height:4px;font-size:0;line-height:0;"></td></tr>
<tr><td class="email-header" bgcolor="#11161d" style="padding:28px 36px;background:#11161d;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="44" style="width:44px;"><a href="${escape(origin)}/${language}" style="text-decoration:none;"><img src="${escape(origin)}/favicon.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;"></a></td><td style="padding-left:14px;"><a href="${escape(origin)}/${language}" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;letter-spacing:-1px;font-weight:900;color:#ffffff;text-decoration:none;">CS2<span style="color:#f5a021;"> BOOST</span></a><div style="padding-top:5px;color:#9aa8b8;font-family:Courier New,monospace;font-size:10px;line-height:14px;letter-spacing:1px;">PREMIER / FACEIT</div></td></tr></table>
</td></tr>
<tr><td class="email-content" style="padding:36px;background:#ffffff;">
<p style="margin:0 0 14px;color:#925800;font-family:Courier New,monospace;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;">${escape(kicker || (ru ? "ЛИЧНЫЙ КАБИНЕТ" : "YOUR ACCOUNT"))}</p>
<h1 class="email-title" style="margin:0 0 20px;color:#17202c;font-size:30px;line-height:37px;letter-spacing:-.7px;font-weight:700;">${escape(title)}</h1>
${copy.map(part => `<p style="margin:0 0 16px;color:#465363;font-size:15px;line-height:25px;">${paragraph(part)}</p>`).join("\n")}
${button}
${notice ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f1f4f7" style="padding:16px 18px;background:#f1f4f7;border-left:3px solid #f5a021;color:#465363;font-size:13px;line-height:21px;">${paragraph(notice)}</td></tr></table>` : ""}
${footnote ? `<p style="margin:22px 0 0;color:#647080;font-size:13px;line-height:21px;">${paragraph(footnote)}</p>` : ""}
${backup}
</td></tr>
<tr><td class="email-footer" bgcolor="#f6f8fa" style="padding:24px 36px;background:#f6f8fa;border-top:1px solid #e3e8ee;">
<p style="margin:0 0 12px;font-size:12px;line-height:20px;"><a href="${escape(origin)}/${language}" style="color:#465363;text-decoration:underline;">${ru ? "Сайт" : "Website"}</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escape(origin)}/support" style="color:#465363;text-decoration:underline;">${ru ? "Поддержка" : "Support"}</a>${settings ? `&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${escape(settings)}" style="color:#465363;text-decoration:underline;">${ru ? "Уведомления" : "Notifications"}</a>` : ""}</p>
<p style="margin:0;color:#6b7786;font-size:11px;line-height:18px;">${ru ? "Это автоматическое письмо CS2 Boost. Для связи с нами откройте поддержку на сайте." : "This is an automated email from CS2 Boost. To contact us, open support on the website."}</p>
</td></tr></table></td></tr></table>
</body></html>`;
}

export function brandedLetter(options) {
  return { subject: options.subject, text: options.text, html: emailHtml(options) };
}
