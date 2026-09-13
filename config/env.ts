import { z } from 'zod';
import { isPlaceholderDatabaseUrl } from '@/lib/database-url';
import { blankToUndefined } from '@/lib/env-value';

/**
 * Environment is validated once, at boot, and fails loudly.
 * A missing DATABASE_URL should stop the process — not surface later as a
 * confusing runtime error on a customer's checkout.
 *
 * Every failure message names the fix, because this error is almost always
 * someone's first run and "invalid environment variables" alone tells them
 * nothing they can act on.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((url) => !isPlaceholderDatabaseUrl(url), {
      message: 'DATABASE_URL is still the example value from .env.example',
    })
    .refine((url) => /^postgres(ql)?:\/\//.test(url), {
      message: 'DATABASE_URL must start with postgresql://',
    }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

/**
 * Image upload. Optional, and deliberately so.
 *
 * A store with no storage configured still runs: the product form falls back
 * to typing a path under `public/`, which is what the owner's own machine
 * needs anyway. Making these required would mean a fresh clone could not boot
 * without a Supabase account — a hard stop for a task that is not on the
 * critical path.
 *
 * The service role key bypasses every row-level policy in the project. It is
 * read only here and used only in `server/services/admin-storage.ts`, which is
 * server-only and guarded; it must never be exposed with a NEXT_PUBLIC_ name.
 */
const storageEnvSchema = z.object({
  SUPABASE_URL: z.preprocess(
    blankToUndefined,
    z
      .url()
      .optional()
      .refine((url) => !url || !url.endsWith('/'), {
        message: 'SUPABASE_URL must not end with a slash',
      }),
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    blankToUndefined,
    z.string().min(20).optional(),
  ),
  SUPABASE_STORAGE_BUCKET: z.preprocess(
    blankToUndefined,
    z.string().min(1).default('product-images'),
  ),
});

/**
 * Google sign-in. Optional, like storage.
 *
 * Email and password stays enabled alongside it: not every customer in Iraq
 * has a Google account, and the store's own staff accounts are addresses on
 * the shop's domain. Google is an additional door, never a replacement for the
 * one that already works.
 */
const googleEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.preprocess(blankToUndefined, z.string().min(10).optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().min(10).optional()),
});

/** How to obtain each value, shown alongside the variable that is missing. */
const REMEDIES: Record<string, string> = {
  DATABASE_URL:
    'A PostgreSQL connection string. Local: `docker compose up -d`, then\n' +
    '      postgresql://mps:mps_dev_password@127.0.0.1:5432/mps_dev?schema=public\n' +
    '      Hosted: see docs/database-setup-ar.md',
  BETTER_AUTH_SECRET:
    'Generate one with:\n' +
    "      node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  BETTER_AUTH_URL: 'The full site URL, e.g. http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'The full site URL, e.g. http://localhost:3000',
  SUPABASE_URL:
    'Supabase dashboard → Project Settings → Data API → Project URL.\n' +
    '      Looks like https://<ref>.supabase.co — no trailing slash.',
  SUPABASE_SERVICE_ROLE_KEY:
    'Supabase dashboard → Project Settings → API keys → service_role.\n' +
    '      SECRET: it bypasses every row-level policy. Server-side only,\n' +
    '      never in a NEXT_PUBLIC_ variable, never committed.',
  SUPABASE_STORAGE_BUCKET: 'The storage bucket name. Defaults to product-images.',
  GOOGLE_CLIENT_ID:
    'Google Cloud console → APIs & Services → Credentials →\n' +
    '      OAuth client ID (Web application). Add the redirect URI\n' +
    '      <BETTER_AUTH_URL>/api/auth/callback/google exactly.',
  GOOGLE_CLIENT_SECRET:
    'The same OAuth client. SECRET: server-side only, never committed.',
};

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const name = issue.path.join('.');
      const remedy = REMEDIES[name];
      return remedy
        ? `  - ${name}: ${issue.message}\n      ${remedy}`
        : `  - ${name}: ${issue.message}`;
    })
    .join('\n');
}

function envError(scope: string, issues: readonly z.core.$ZodIssue[]): Error {
  return new Error(
    [
      `Invalid ${scope} environment variables in .env:`,
      '',
      formatIssues(issues),
      '',
      'Fix them all at once by running:  pnpm setup',
      'Or edit .env by hand — .env.example lists every variable.',
      '',
    ].join('\n'),
  );
}

function parseServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw envError('server', parsed.error.issues);
  }

  return parsed.data;
}

function parsePublicEnv() {
  // Next.js inlines NEXT_PUBLIC_* at build time, so they must be referenced
  // statically rather than looked up dynamically on process.env.
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw envError('public', parsed.error.issues);
  }

  return parsed.data;
}

function parseStorageEnv() {
  const parsed = storageEnvSchema.safeParse(process.env);

  // A *malformed* value is still an error — silently ignoring a typo'd
  // SUPABASE_URL would leave the owner clicking an upload button that fails
  // for a reason nothing on screen can explain.
  if (!parsed.success) throw envError('storage', parsed.error.issues);

  return parsed.data;
}

export const serverEnv = parseServerEnv();
export const publicEnv = parsePublicEnv();
export const storageEnv = parseStorageEnv();

/**
 * Whether uploads are available at all.
 *
 * Both halves are needed: a URL with no key cannot write, and a key with no
 * URL has nowhere to write to. The UI asks this before offering the button,
 * because an upload control that always fails is worse than none.
 */
export const isUploadConfigured = Boolean(
  storageEnv.SUPABASE_URL && storageEnv.SUPABASE_SERVICE_ROLE_KEY,
);

function parseGoogleEnv() {
  const parsed = googleEnvSchema.safeParse(process.env);
  if (!parsed.success) throw envError('google', parsed.error.issues);
  return parsed.data;
}

export const googleEnv = parseGoogleEnv();

/**
 * Whether "continue with Google" can work.
 *
 * Half-configured is the same as unconfigured: an id with no secret cannot
 * complete the exchange, and a button that always ends on an error page is
 * worse than no button.
 */
export const isGoogleSignInConfigured = Boolean(
  googleEnv.GOOGLE_CLIENT_ID && googleEnv.GOOGLE_CLIENT_SECRET,
);
