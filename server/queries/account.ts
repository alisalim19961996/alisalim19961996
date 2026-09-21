import 'server-only';

import type { Governorate } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireUser } from '@/server/auth/guards';

/**
 * Reads for the customer's own account screens.
 *
 * Scoped by the session, never by an id from the caller: a function that took
 * a user id would be one mistaken argument away from printing somebody else's
 * street (§7 — the guard protects the data).
 */

export interface SavedAddressView {
  fullName: string;
  phone: string;
  governorate: Governorate;
  city: string;
  addressLine: string;
  notes: string | null;
}

/**
 * The address checkout will offer to fill in, or null when there is none.
 *
 * `findFirst` with the same ordering the writer uses, so the row read here is
 * the row a save will update. Columns are named — the table also carries a
 * landmark and timestamps that no screen renders.
 */
export async function getMyDeliveryAddress(): Promise<SavedAddressView | null> {
  const user = await requireUser();

  return db.address.findFirst({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: {
      fullName: true,
      phone: true,
      governorate: true,
      city: true,
      addressLine: true,
      notes: true,
    },
  });
}
