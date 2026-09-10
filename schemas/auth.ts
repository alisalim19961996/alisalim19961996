import { z } from 'zod';
import { iraqiPhoneSchema } from './common';

/**
 * Error messages are i18n KEYS, not sentences. The UI resolves them through
 * next-intl so a validation failure is never English-only in an Arabic form.
 */

export const passwordSchema = z
  .string()
  .min(8, 'passwordTooShort')
  .max(128, 'tooLong');

export const loginSchema = z.object({
  email: z.email('invalidEmail').trim().toLowerCase(),
  password: z.string().min(1, 'required'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(3, 'required').max(120, 'tooLong'),
    email: z.email('invalidEmail').trim().toLowerCase(),
    phone: iraqiPhoneSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.email('invalidEmail').trim().toLowerCase(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
