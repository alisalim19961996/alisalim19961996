/**
 * An email is the one piece of UI nobody sees before a customer does, and its
 * failures are silent: a broken link, an unescaped name, the wrong language.
 * None of them throw.
 */
import { describe, expect, it } from 'vitest';
import { escapeHtml, passwordResetMail } from '@/lib/domain/mail-templates';

describe('escapeHtml', () => {
  it('neutralises a name that contains markup', () => {
    // The greeting carries whatever the customer typed at registration.
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes quotes, which would otherwise break out of an attribute', () => {
    expect(escapeHtml(`" onload="x`)).toBe('&quot; onload=&quot;x');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes the ampersand first, so an entity is not double-broken', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('leaves ordinary Arabic alone', () => {
    expect(escapeHtml('علي سالم')).toBe('علي سالم');
  });
});

describe('passwordResetMail', () => {
  const url = 'https://mps.example/api/auth/reset-password/abc123?callbackURL=%2Far';

  it('writes Arabic for an Arabic customer, right-to-left', () => {
    const mail = passwordResetMail({ name: 'علي', url, locale: 'ar' });
    expect(mail.subject).toContain('إعادة تعيين');
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('lang="ar"');
    expect(mail.text).toContain('هلا علي');
  });

  it('writes English for an English customer', () => {
    const mail = passwordResetMail({ name: 'Ali', url, locale: 'en' });
    expect(mail.subject).toContain('Reset your password');
    expect(mail.html).toContain('dir="ltr"');
    expect(mail.text).toContain('Hello Ali');
  });

  it('carries the link in both the HTML and the plain text', () => {
    // A client that strips the anchor still has to leave something copyable.
    const mail = passwordResetMail({ name: 'Ali', url, locale: 'ar' });
    expect(mail.html).toContain(`href="${escapeHtml(url)}"`);
    expect(mail.text).toContain(url);
  });

  it('never emits an empty part', () => {
    for (const locale of ['ar', 'en'] as const) {
      const mail = passwordResetMail({ name: 'Ali', url, locale });
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.html.length).toBeGreaterThan(0);
      expect(mail.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('escapes a hostile name in the HTML but not the plain text', () => {
    const mail = passwordResetMail({ name: '<b>x</b>', url, locale: 'en' });
    expect(mail.html).not.toContain('<b>x</b>');
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    // Plain text has no markup to inject into, and escaping there would show
    // the customer literal entity codes where their name should be.
    expect(mail.text).toContain('<b>x</b>');
  });

  it('says the link expires and how to ignore it', () => {
    // Both lines exist because a reset email that explains neither is how a
    // customer decides the shop has been broken into.
    const mail = passwordResetMail({ name: 'Ali', url, locale: 'ar' });
    expect(mail.text).toContain('ساعة');
    expect(mail.text).toContain('تجاهل');
  });
});
