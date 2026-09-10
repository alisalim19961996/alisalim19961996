import { z } from 'zod';

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
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
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

export const serverEnv = parseServerEnv();
export const publicEnv = parsePublicEnv();
