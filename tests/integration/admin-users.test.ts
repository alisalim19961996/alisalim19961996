import 'dotenv/config';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * Handing out access, against a real database.
 *
 * Every assertion here is about a state the app **cannot recover from**: a
 * store with no reachable ADMIN is fixable only with a database client, which
 * is the exact situation this screen was built to end. The counts that decide
 * each refusal are read from Postgres inside the same call that acts on them,
 * so a fake would be testing the wrong thing.
 */

const ACTOR = { id: '', name: 'Root Admin', email: '', role: Role.ADMIN };

vi.mock('@/server/auth/guards', () => ({
  getCurrentUser: async () => (ACTOR.id ? ACTOR : null),
  requireUser: async () => ACTOR,
  requireStaff: async () => ACTOR,
  requireAdmin: async () => {
    if (!ACTOR.id) throw new Error('not admin');
    return ACTOR;
  },
}));

const { db } = await import('@/server/db/client');
const { setUserActive, setUserRole, UserAdminError } =
  await import('@/server/services/admin-users');
const { getAdminUsers } = await import('@/server/queries/admin-users');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

async function makeUser(label: string, role: Role, isActive = true) {
  const user = await db.user.create({
    data: {
      email: `users-${label}-${SUFFIX}@mps.local`,
      name: `User ${label}`,
      role,
      isActive,
      emailVerified: false,
    },
    select: { id: true },
  });
  made.push(user.id);
  return user.id;
}

/**
 * Exactly one ADMIN exists while each test runs, and it is the actor.
 *
 * The refusals count admins **globally**, so anything else with the role —
 * the seeded `admin@mps.local`, or the actor left behind by the previous test
 * — keeps the count above one and the "last admin" cases silently never fire.
 * They would pass while proving nothing, which is the worst kind of green.
 *
 * **This mutates a user the suite did not create, and an earlier version of it
 * left the dev database with zero admins** — the exact state the feature under
 * test exists to prevent — because it restored only in `afterAll` and a run was
 * interrupted. Restoring in `afterEach` narrows the window to a single test.
 * If a run is still killed inside that window, `pnpm db:seed` puts
 * `admin@mps.local` back: its upsert sets the role every time.
 */
let outsiders: string[] = [];

async function parkOutsiders() {
  const rows = await db.user.findMany({
    where: { role: Role.ADMIN, isActive: true, id: { notIn: made } },
    select: { id: true },
  });
  outsiders = rows.map((row) => row.id);
  if (outsiders.length > 0) {
    await db.user.updateMany({
      where: { id: { in: outsiders } },
      data: { role: Role.CUSTOMER },
    });
  }
}

async function restoreOutsiders() {
  if (outsiders.length === 0) return;
  await db.user.updateMany({
    where: { id: { in: outsiders } },
    data: { role: Role.ADMIN },
  });
  outsiders = [];
}

beforeEach(async () => {
  await parkOutsiders();

  // Stand down every admin this suite created earlier, then appoint one.
  if (made.length > 0) {
    await db.user.updateMany({
      where: { id: { in: made }, role: Role.ADMIN },
      data: { role: Role.CUSTOMER },
    });
  }

  ACTOR.id = await makeUser(`actor-${made.length}`, Role.ADMIN);

  const admins = await db.user.count({ where: { role: Role.ADMIN, isActive: true } });
  // The fixture's own assertion: if this drifts, every refusal below is vacuous.
  expect(admins).toBe(1);
});

// Runs even when the test throws, which is the whole point.
afterEach(restoreOutsiders);

afterAll(async () => {
  await restoreOutsiders();
  await db.session.deleteMany({ where: { userId: { in: made } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

describe('promoting and demoting', () => {
  it('promotes a customer to staff', async () => {
    const id = await makeUser(`p1-${Date.now()}`, Role.CUSTOMER);
    await setUserRole(id, Role.STAFF);

    const after = await db.user.findUniqueOrThrow({ where: { id } });
    expect(after.role).toBe(Role.STAFF);
  });

  it('refuses to change the acting admin’s own role', async () => {
    await expect(setUserRole(ACTOR.id, Role.STAFF)).rejects.toMatchObject({
      code: 'cannotChangeOwnRole',
    });

    const after = await db.user.findUniqueOrThrow({ where: { id: ACTOR.id } });
    expect(after.role).toBe(Role.ADMIN);
  });

  it('allows demoting a second admin, because the actor remains', async () => {
    // The actor is an admin too, so the store is never left without one.
    const second = await makeUser(`p2-${Date.now()}`, Role.ADMIN);
    await setUserRole(second, Role.STAFF);
    expect((await db.user.findUniqueOrThrow({ where: { id: second } })).role).toBe(
      Role.STAFF,
    );
  });

  it('refuses to demote the last admin standing', async () => {
    /*
      Constructed rather than natural: the actor cannot be the last admin AND
      the target, because changing your own role is refused first and by a
      different rule. So the actor steps out of the count — still admin to the
      mocked guard, no longer admin in the database — leaving `survivor` as the
      only one. What this proves that the unit test cannot is that the count
      comes from Postgres, inside the same call that acts on it.
    */
    const survivor = await makeUser(`p3-${Date.now()}`, Role.ADMIN);
    await db.user.update({
      where: { id: ACTOR.id },
      data: { role: Role.STAFF },
    });

    await expect(setUserRole(survivor, Role.CUSTOMER)).rejects.toMatchObject({
      code: 'lastAdmin',
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: survivor } })).role).toBe(
      Role.ADMIN,
    );

    await db.user.update({ where: { id: ACTOR.id }, data: { role: Role.ADMIN } });
  });

  it('says nothing changed rather than writing the same value', async () => {
    const id = await makeUser(`p4-${Date.now()}`, Role.STAFF);
    await expect(setUserRole(id, Role.STAFF)).rejects.toMatchObject({
      code: 'noChange',
    });
  });

  it('refuses a user that does not exist', async () => {
    await expect(setUserRole('not-a-real-id', Role.STAFF)).rejects.toBeInstanceOf(
      UserAdminError,
    );
  });
});

describe('deactivating', () => {
  it('signs the account out of every device', async () => {
    const id = await makeUser(`d1-${Date.now()}`, Role.STAFF);
    await db.session.create({
      data: {
        userId: id,
        token: `itest-session-${SUFFIX}-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await setUserActive(id, false);

    // The guard already rejects an inactive user holding a valid cookie, but
    // a dismissed employee should be signed out, not merely unable to act.
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
  });

  it('refuses to deactivate yourself', async () => {
    await expect(setUserActive(ACTOR.id, false)).rejects.toMatchObject({
      code: 'cannotDeactivateSelf',
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: ACTOR.id } })).isActive,
    ).toBe(true);
  });

  it('refuses to deactivate the last admin', async () => {
    const survivor = await makeUser(`d2-${Date.now()}`, Role.ADMIN);
    await db.user.update({ where: { id: ACTOR.id }, data: { role: Role.STAFF } });

    await expect(setUserActive(survivor, false)).rejects.toMatchObject({
      code: 'lastAdmin',
    });

    await db.user.update({ where: { id: ACTOR.id }, data: { role: Role.ADMIN } });
  });

  it('always allows switching somebody back on', async () => {
    const id = await makeUser(`d3-${Date.now()}`, Role.ADMIN, false);
    await setUserActive(id, true);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
  });
});

describe('the list', () => {
  it('counts only ACTIVE admins, because an inactive one cannot unlock anything', async () => {
    await makeUser(`l1-${Date.now()}`, Role.ADMIN, false);
    const { activeAdminCount } = await getAdminUsers();

    const reallyActive = await db.user.count({
      where: { role: Role.ADMIN, isActive: true },
    });
    expect(activeAdminCount).toBe(reallyActive);
  });

  it('finds a user by email', async () => {
    const id = await makeUser(`l2-${Date.now()}`, Role.CUSTOMER);
    const email = (await db.user.findUniqueOrThrow({ where: { id } })).email;

    const { rows } = await getAdminUsers({ q: email });
    expect(rows.map((row) => row.id)).toContain(id);
  });

  it('filters by role in SQL', async () => {
    const { rows } = await getAdminUsers({ role: Role.ADMIN });
    expect(rows.every((row) => row.role === Role.ADMIN)).toBe(true);
  });
});
