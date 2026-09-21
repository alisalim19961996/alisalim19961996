import 'server-only';

import { db } from '@/server/db/client';
import { requireUser } from '@/server/auth/guards';
import type { ProfileInput, SavedAddressInput } from '@/schemas/account';

/**
 * The customer's own details.
 *
 * Until this existed, `/account` showed the name and phone and told the
 * customer to get in touch to change them — which is unpaid manual work for
 * the owner and a phone call for somebody who mistyped their own number.
 *
 * `requireUser()` is called HERE and the id comes from the session, never from
 * the caller. A function that accepts a user id is one mistaken argument away
 * from letting anybody rename anybody (§7: the guard protects the data).
 */
export async function updateProfile(input: ProfileInput): Promise<void> {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    // Exactly two columns. Spreading the input would make every future field
    // on `User` — role and isActive among them — writable from a profile form.
    data: { name: input.name, phone: input.phone },
  });
}

/**
 * The customer's saved delivery address.
 *
 * One address, not a book. Every customer here pays cash at one door, and a
 * picker with a single entry is a step that asks a question with one answer.
 * The `Address` table keeps `isDefault` and its own primary key, so a second
 * address later is a screen, not a migration.
 *
 * The row is taken under a lock on the OWNER, not looked up and then written:
 * two saves from two tabs would otherwise both find nothing and both insert,
 * leaving the customer with two addresses and no way to tell which one
 * checkout will offer.
 */
export async function saveDeliveryAddress(input: SavedAddressInput): Promise<void> {
  const user = await requireUser();

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "user" WHERE "id" = ${user.id} FOR UPDATE`;

    const existing = await tx.address.findFirst({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const data = {
      fullName: input.fullName,
      phone: input.phone,
      governorate: input.governorate,
      city: input.city,
      addressLine: input.addressLine,
      notes: input.notes,
    };

    if (existing) {
      await tx.address.update({ where: { id: existing.id }, data });
      return;
    }

    await tx.address.create({
      data: { ...data, userId: user.id, isDefault: true },
    });
  });
}
