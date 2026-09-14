/**
 * The emails MPS sends, as text.
 *
 * Pure and framework-free so they can be unit-tested (§17): an email is the one
 * piece of UI nobody sees before a customer does, and the failures are silent —
 * a broken link, an unescaped name, the wrong language. None of those throw.
 *
 * The copy is **not** in `messages/*.json`. next-intl resolves a locale from
 * the request, and this runs inside better-auth's `sendResetPassword` hook,
 * which has no request context of its own — reaching for one there is how the
 * email ends up in whichever language the server booted in.
 */

export type MailLocale = 'ar' | 'en';

export interface MailBody {
  subject: string;
  html: string;
  text: string;
}

/**
 * Escape for HTML.
 *
 * The user's own name goes in the greeting, and a name is whatever they typed
 * at registration. Without this, `<script>` in a display name is delivered to
 * their inbox — and some mail clients still render more than they should.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY = {
  ar: {
    subject: 'إعادة تعيين كلمة المرور — MPS',
    greeting: (name: string) => `هلا ${name}`,
    body: 'وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط على الرابط حتى تختار كلمة مرور جديدة:',
    cta: 'إعادة تعيين كلمة المرور',
    expiry: 'الرابط يشتغل لمدة ساعة وحدة، ومرة وحدة بس.',
    ignore: 'إذا ما طلبت هذا الشي، تجاهل الرسالة — حسابك ما تغيّر شي بيه.',
    dir: 'rtl',
  },
  en: {
    subject: 'Reset your password — MPS',
    greeting: (name: string) => `Hello ${name}`,
    body: 'We received a request to reset your account password. Use the link below to choose a new one:',
    cta: 'Reset password',
    expiry: 'The link works for one hour, and once only.',
    ignore:
      'If you did not ask for this, ignore this message — nothing about your account has changed.',
    dir: 'ltr',
  },
} as const;

/**
 * The password-reset email.
 *
 * The URL is printed as text as well as linked, because a mail client that
 * strips the anchor still has to leave the customer something they can copy.
 */
export function passwordResetMail(options: {
  name: string;
  url: string;
  locale: MailLocale;
}): MailBody {
  const copy = COPY[options.locale];
  const name = escapeHtml(options.name);
  const url = escapeHtml(options.url);

  const html = `<!doctype html>
<html lang="${options.locale}" dir="${copy.dir}">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:system-ui,sans-serif;color:#0a0a0b">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7e9;border-radius:12px;padding:32px">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600">${copy.greeting(name)}</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.75;color:#2c2c30">${copy.body}</p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;background:#e11b22;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">${copy.cta}</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.75;color:#6b7280;word-break:break-all" dir="ltr">${url}</p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.75;color:#6b7280">${copy.expiry}</p>
      <p style="margin:8px 0 0;font-size:12px;line-height:1.75;color:#6b7280">${copy.ignore}</p>
    </div>
  </body>
</html>`;

  const text = [
    copy.greeting(options.name),
    '',
    copy.body,
    options.url,
    '',
    copy.expiry,
    copy.ignore,
  ].join('\n');

  return { subject: copy.subject, html, text };
}
