import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';

/**
 * Authentication is deliberately isolated behind this module and the guards in
 * ./guards.ts. Application code never imports better-auth directly, so the
 * provider can be replaced without touching feature code.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Verification is switched on once an email provider is configured.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    additionalFields: {
      // Role lives on the user row and is never accepted from the client.
      role: {
        type: 'string',
        required: false,
        defaultValue: 'CUSTOMER',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
        input: true,
      },
      isActive: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },

  advanced: {
    cookiePrefix: 'mps',
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // Blunt but effective protection against credential stuffing.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 300, max: 3 },
      '/forget-password': { window: 300, max: 3 },
    },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
