import 'server-only';

import { isMailConfigured, mailEnv } from '@/config/env';

/**
 * Sending email, behind one seam.
 *
 * MPS has no mail provider of its own, and the one it uses is the owner's
 * commercial choice — so nothing outside this directory names Resend. The auth
 * config asks for `sendMail` and gets whatever is configured, or nothing.
 *
 * **Unconfigured is a supported state, not a failure.** The store sells
 * without email: checkout never sends one, order tracking needs no inbox, and
 * the account area works on a password alone. What email unlocks is password
 * *reset* — and until it exists, the form says so rather than promising a
 * message that will never arrive (§7 makes the same choice for Google).
 *
 * Talking to the REST API with `fetch` rather than adding a mail SDK, for the
 * same reason `admin-storage.ts` does: this needs one POST, and a dependency
 * would have to satisfy the `minimumReleaseAge` policy and stay pinned for as
 * long as the store lives (§13.9–13.11).
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Both parts, always: a text-only client must not receive a blank message. */
  html: string;
  text: string;
}

export type MailErrorCode = 'notConfigured' | 'rejected' | 'unreachable';

export class MailError extends Error {
  constructor(
    message: string,
    readonly code: MailErrorCode,
    /** The provider's own words, for the server log — never shown to a user. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** The configured provider, or null when the owner has not set one up. */
export function getMailProvider(): MailProvider | null {
  if (!isMailConfigured) return null;
  return resendProvider(mailEnv.RESEND_API_KEY ?? '', mailEnv.MAIL_FROM ?? '');
}

/**
 * Resend, over its REST API.
 *
 * A second provider — SMTP, Postmark, SES — is a second function of this shape
 * and one line in `getMailProvider()`. Nothing above this file changes.
 */
function resendProvider(apiKey: string, from: string): MailProvider {
  return {
    name: 'resend',
    async send(message) {
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
      } catch (error) {
        // No network, DNS, or the provider is down. Distinguished from a
        // rejection because only one of the two is the owner's to fix.
        throw new MailError('mail provider unreachable', 'unreachable', String(error));
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new MailError(
          `mail provider refused: ${response.status}`,
          'rejected',
          detail.slice(0, 500),
        );
      }
    },
  };
}
