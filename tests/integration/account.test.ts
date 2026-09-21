import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Governorate, Role } from '@prisma/client';

/**
 * The customer's own account, against a real database.
 *
 * Two claims are worth Postgres rather than a mock. The profile writes exactly
 * two columns — a service that spread its input would hand a customer their
 * own `role`, and a unit test with a fake client would happily prove the wrong
 * thing. And the saved address is ONE row per customer: "update the existing
 * one, or insert the first" is a read followed by a write, which is the shape
 * that quietly becomes two rows.
 */

const VIEWER = { id: '', name: 'Viewer', email: '', role: Role.CUSTOMER };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (VIEWER.id ? VIEWER : null),
  requireUser: async () => {
    if (!VIEWER.id) throw new Error('not signed in');
    return VIEWER;
  },
  requireStaff: async () => VIEWER,
  requireAdmin: async () => VIEWER,
}));

const { db } = await import('@/server/db/client');
const { getMyDeliveryAddress } = await import('@/server/queries/account');
const { saveDeliveryAddress, updateProfile } =
  await import('@/server/services/account');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

async function makeUser(label: string) {
  const user = await db.user.create({
    data: {
      email: `account-${label}-${SUFFIX}@mps.local`,
      name: `Account ${label}`,
      role: Role.CUSTOMER,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.push(user.id);
  return user;
}

const ADDRESS = {
  fullName: 'زبون تجريبي',
  phone: '+9647701234567',
  governorate: Governorate.BAGHDAD,
  city: 'الكرادة',
  addressLine: 'شارع ٦٢، قرب الجامع',
  notes: null,
};

let owner = '';
let stranger = '';

beforeAll(async () => {
  owner = (await makeUser('owner')).id;
  stranger = (await makeUser('stranger')).id;
});

afterAll(async () => {
  // Address rows cascade with the user, so deleting the users is the cleanup.
  await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

function signIn(id: string) {
  VIEWER.id = id;
}

describe('the customer edits their own details', () => {
  it('writes the name and phone and nothing else', async () => {
    signIn(owner);
    await updateProfile({ name: 'الاسم الجديد', phone: '+9647509876543' });

    const row = await db.user.findUniqueOrThrow({
      where: { id: owner },
      select: { name: true, phone: true, role: true, isActive: true },
    });

    expect(row.name).toBe('الاسم الجديد');
    expect(row.phone).toBe('+9647509876543');
    // The two columns a profile form must never be able to reach.
    expect(row.role).toBe(Role.CUSTOMER);
    expect(row.isActive).toBe(true);
  });

  it('clears the phone rather than storing an empty string', async () => {
    signIn(owner);
    await updateProfile({ name: 'الاسم الجديد', phone: null });

    const row = await db.user.findUniqueOrThrow({
      where: { id: owner },
      select: { phone: true },
    });
    expect(row.phone).toBeNull();
  });
});

describe('the saved delivery address', () => {
  it('is null before anything is saved', async () => {
    signIn(stranger);
    await expect(getMyDeliveryAddress()).resolves.toBeNull();
  });

  it('keeps one row per customer across repeated saves', async () => {
    signIn(owner);
    await saveDeliveryAddress(ADDRESS);
    await saveDeliveryAddress({ ...ADDRESS, city: 'المنصور' });

    const rows = await db.address.findMany({
      where: { userId: owner },
      select: { city: true, isDefault: true },
    });

    // A read-then-create would leave two here, and the account screen would
    // show one address while checkout filled in the other.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.city).toBe('المنصور');
    expect(rows[0]?.isDefault).toBe(true);
  });

  it("reads back only the signed-in customer's address", async () => {
    signIn(owner);
    const mine = await getMyDeliveryAddress();
    expect(mine?.city).toBe('المنصور');

    signIn(stranger);
    // The stranger has saved nothing; a query scoped by anything other than
    // the session would hand them the owner's street.
    await expect(getMyDeliveryAddress()).resolves.toBeNull();
  });

  it('gives each customer their own row', async () => {
    signIn(stranger);
    await saveDeliveryAddress({ ...ADDRESS, city: 'البصرة القديمة' });

    const [mine, theirs] = await Promise.all([
      db.address.findMany({ where: { userId: owner }, select: { city: true } }),
      db.address.findMany({ where: { userId: stranger }, select: { city: true } }),
    ]);

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(mine[0]?.city).toBe('المنصور');
    expect(theirs[0]?.city).toBe('البصرة القديمة');
  });
});
