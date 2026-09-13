import 'server-only';

import type { Governorate } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireAdmin, requireStaff } from '@/server/auth/guards';
import { normalizeIraqiPhone } from '@/lib/phone';
import type { DeliveryRateInput, SiteSettingsInput } from '@/schemas/admin';

/**
 * Store settings and delivery pricing.
 *
 * This is the point of the whole `SiteSetting` / `DeliveryRate` design: the
 * owner changes a delivery fee or a WhatsApp number without a deployment, and
 * CLAUDE.md §13.13 forbids any of it being hard-coded in a component.
 *
 * Changing money is `requireAdmin`, not `requireStaff`: someone processing
 * orders does not need the ability to make delivery free nationwide.
 */

/** The single settings row, created on first write. */
const SETTINGS_ID = 'singleton';

export async function getSiteSettings() {
  await requireStaff();
  return db.siteSetting.findUnique({ where: { id: SETTINGS_ID } });
}

export async function updateSiteSettings(input: SiteSettingsInput): Promise<void> {
  await requireAdmin();

  // Contact numbers are stored E.164 like every other phone in the system, so
  // a `tel:` link and a WhatsApp link can be built without guessing a format.
  // An unparseable number is kept as typed rather than dropped — a landline or
  // a foreign number is still a way to reach the store.
  const contactPhone = input.contactPhone
    ? (normalizeIraqiPhone(input.contactPhone) ?? input.contactPhone)
    : null;
  const whatsappNumber = input.whatsappNumber
    ? (normalizeIraqiPhone(input.whatsappNumber) ?? input.whatsappNumber)
    : null;

  const data = {
    storeNameAr: input.storeNameAr,
    storeNameEn: input.storeNameEn,
    contactPhone,
    whatsappNumber,
    contactEmail: input.contactEmail,
    defaultDeliveryIqd: input.defaultDeliveryIqd,
    freeDeliveryOverIqd: input.freeDeliveryOverIqd,
    warrantyNoteAr: input.warrantyNoteAr,
    warrantyNoteEn: input.warrantyNoteEn,
  };

  await db.siteSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

export async function getDeliveryRates() {
  await requireStaff();
  return db.deliveryRate.findMany({
    select: {
      governorate: true,
      feeIqd: true,
      etaMinDays: true,
      etaMaxDays: true,
      isActive: true,
    },
    orderBy: { governorate: 'asc' },
  });
}

/**
 * Set one governorate's rate.
 *
 * Upsert rather than update: a governorate with no row is not an error — it
 * falls back to `defaultDeliveryIqd` — so the first time the owner prices one,
 * the row has to be created.
 */
export async function updateDeliveryRate(input: DeliveryRateInput): Promise<void> {
  await requireAdmin();

  const governorate = input.governorate as Governorate;
  const data = {
    feeIqd: input.feeIqd,
    etaMinDays: input.etaMinDays,
    etaMaxDays: input.etaMaxDays,
    isActive: input.isActive,
  };

  await db.deliveryRate.upsert({
    where: { governorate },
    create: { governorate, ...data },
    update: data,
  });
}
