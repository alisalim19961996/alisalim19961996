import { z } from 'zod';

/**
 * Environment is validated once, at boot, and fails loudly.
 * A missing DATABASE_URL should stop the process — not surface later as a
 * confusing runtime error on a customer's checkout.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

function parseServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${issues}`);
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
    throw new Error(
      `Invalid public environment variables: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}`,
    );
  }

  return parsed.data;
}

export const serverEnv = parseServerEnv();
export const publicEnv = parsePublicEnv();
