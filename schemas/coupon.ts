import { z } from 'zod';
import { DiscountType } from '@prisma/client';

/**
 * Input for the coupon editor.
 *
 * Every number here becomes money off an order, so the ceilings are not
 * decoration: a percentage above 100 is refused by a CHECK constraint too, and
 * a fixed amount with no upper bound is one stray keystroke from a free shop.
 *
 * Error messages are keys under the `admin` namespace, never sentences.
 */

const required = 'required';

/** Codes are typed by people, so they are stored the way people read them. */
const code = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, required)
  .max(40, 'tooLong')
  .regex(/^[A-Z0-9_-]+$/, 'invalidCouponCode');

const wholeIqd = (max: number) => z.coerce.number().int('notWhole').min(0).max(max);

export const couponFormSchema = z
  .object({
    code,
    discountType: z.enum(DiscountType),
    discountValue: z.coerce.number().int('notWhole').min(1, required).max(10_000_000),
    minOrderIqd: wholeIqd(100_000_000).default(0),
    maxDiscountIqd: z
      .union([z.literal(''), wholeIqd(100_000_000)])
      .optional()
      .transform((value) => (value === '' || value == null ? null : value)),
    usageLimit: z
      .union([z.literal(''), z.coerce.number().int('notWhole').min(1).max(1_000_000)])
      .optional()
      .transform((value) => (value === '' || value == null ? null : value)),
    perUserLimit: z.coerce.number().int('notWhole').min(1).max(1_000).default(1),
    startsAt: z.union([z.iso.datetime({ local: true }), z.iso.date()]),
    endsAt: z.union([z.iso.datetime({ local: true }), z.iso.date()]),
    isActive: z.coerce.boolean().default(true),
  })
  .transform((value) => ({
    ...value,
    startsAt: new Date(value.startsAt),
    endsAt: new Date(value.endsAt),
  }))
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: 'couponDatesReversed',
    path: ['endsAt'],
  })
  .refine(
    (value) =>
      value.discountType !== DiscountType.PERCENTAGE || value.discountValue <= 100,
    {
      // Also a CHECK constraint on the table. Caught here so the owner reads a
      // sentence in their own language instead of a Postgres error.
      message: 'couponPercentageTooHigh',
      path: ['discountValue'],
    },
  );

export type CouponFormInput = z.infer<typeof couponFormSchema>;
