import 'dotenv/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Resend sender.
 *
 * It lives in `tests/integration/` only because that config stubs
 * `server-only` (§17) — it needs no database and talks to no network: `fetch`
 * is replaced, because the point is what MPS *sends*, not what Resend does
 * with it.
 *
 * Worth testing at all because this code path runs for the first time on the
 * day the owner adds a key, which is the worst day to discover it posts the
 * wrong shape.
 */

const KEY = 're_test_key_0123456789';
const FROM = 'MPS <no-reply@example.test>';

vi.mock('@/config/env', () => ({
  isMailConfigured: true,
  mailEnv: { RESEND_API_KEY: KEY, MAIL_FROM: FROM },
}));

const { getMailProvider, MailError } = await import('@/server/mail/provider');

const MESSAGE = {
  to: 'customer@example.test',
  subject: 'إعادة تعيين كلمة المرور — MPS',
  html: '<p>مرحبا</p>',
  text: 'مرحبا',
};

let calls: { url: string; init: RequestInit }[] = [];

function respondWith(response: Response | (() => never)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (typeof response === 'function') response();
      return response;
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Resend provider', () => {
  it('posts the message to the right endpoint, authenticated', async () => {
    respondWith(new Response('{"id":"x"}', { status: 200 }));

    await getMailProvider()?.send(MESSAGE);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://api.resend.com/emails');
    expect(call?.init.method).toBe('POST');
    expect((call?.init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${KEY}`,
    );
  });

  it('sends both the html and the text part', async () => {
    respondWith(new Response('{"id":"x"}', { status: 200 }));
    await getMailProvider()?.send(MESSAGE);

    const body = JSON.parse(String(calls[0]?.init.body));
    // A text-only client must not receive a blank message.
    expect(body.html).toBe(MESSAGE.html);
    expect(body.text).toBe(MESSAGE.text);
    expect(body.subject).toBe(MESSAGE.subject);
    expect(body.from).toBe(FROM);
    expect(body.to).toEqual([MESSAGE.to]);
  });

  it('never puts the api key in the body', async () => {
    respondWith(new Response('{"id":"x"}', { status: 200 }));
    await getMailProvider()?.send(MESSAGE);
    expect(String(calls[0]?.init.body)).not.toContain(KEY);
  });

  it('distinguishes a refusal from an outage', async () => {
    // Only one of the two is the owner's to fix, and the message they see
    // depends on telling them apart.
    respondWith(new Response('domain is not verified', { status: 403 }));
    await expect(getMailProvider()?.send(MESSAGE)).rejects.toMatchObject({
      code: 'rejected',
    });

    respondWith(() => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });
    await expect(getMailProvider()?.send(MESSAGE)).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('carries the provider’s own words for the log, truncated', async () => {
    respondWith(new Response('x'.repeat(2000), { status: 422 }));

    const error = await getMailProvider()
      ?.send(MESSAGE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MailError);
    expect(
      (error as InstanceType<typeof MailError>).detail?.length,
    ).toBeLessThanOrEqual(500);
  });

  it('resolves silently on success, so the caller has nothing to handle', async () => {
    respondWith(new Response('{"id":"x"}', { status: 200 }));
    await expect(getMailProvider()?.send(MESSAGE)).resolves.toBeUndefined();
  });
});
