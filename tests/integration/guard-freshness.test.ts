import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

/**
 * Where a guard gets `role` and `isActive` from, against a real database.
 *
 * better-auth is configured with `session.cookieCache` at five minutes, which
 * is what keeps `getCurrentUser()` off the database on every page render. It
 * also means a session result can carry a role and an active flag that are up
 * to five minutes old — so a dismissed employee kept their dashboard for
 * another five minutes, and a demoted one kept their powers.
 *
 * These tests hand the guard a session that is exactly that stale and assert
 * the row wins. The session is mocked because the staleness IS the fixture:
 * there is no way to age a real cookie cache inside a test run, and faking the
 * user row would test nothing.
 */

const SESSION: {
  user: { id: string; name: string; email: string; role: Role; isActive: boolean };
} = {
  user: { id: '', name: '', email: '', role: Role.ADMIN, isActive: true },
};

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

vi.mock('@/server/auth/auth', () => ({
  auth: { api: { getSession: async () => (SESSION.user.id ? SESSION : null) } },
}));

const { db } = await import('@/server/db/client');
const {
  requireStaff,
  requireAdmin,
  requireUser,
  ForbiddenError,
  UnauthenticatedError,
} = await import('@/server/auth/guards');

const SUFFIX = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

async function makeUser(role: Role, isActive = true) {
  const user = await db.user.create({
    data: {
      email: `guard-${made.length}-${SUFFIX}@mps.local`,
      name: 'Guard subject',
      role,
      isActive,
      emailVerified: false,
    },
    select: { id: true, email: true, name: true },
  });
  made.push(user.id);
  SESSION.user = { ...SESSION.user, id: user.id, email: user.email, name: user.name };
  return user;
}

beforeEach(() => {
  // Every test starts from the most generous possible stale session: the
  // cookie still says ADMIN and still says active.
  SESSION.user = { ...SESSION.user, role: Role.ADMIN, isActive: true };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

describe('a session that is out of date', () => {
  it('does not let a demoted employee keep staff access', async () => {
    const user = await makeUser(Role.STAFF);
    await db.user.update({ where: { id: user.id }, data: { role: Role.CUSTOMER } });

    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('does not let a demoted admin keep admin access', async () => {
    const user = await makeUser(Role.ADMIN);
    await db.user.update({ where: { id: user.id }, data: { role: Role.STAFF } });

    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
    // Still staff, though: the row decides, and the row says STAFF.
    await expect(requireStaff()).resolves.toMatchObject({ role: Role.STAFF });
  });

  it('does not let a deactivated employee act', async () => {
    const user = await makeUser(Role.STAFF);
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });

    await expect(requireStaff()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('does not let a deleted user act', async () => {
    const user = await makeUser(Role.ADMIN);
    await db.user.delete({ where: { id: user.id } });
    made.splice(made.indexOf(user.id), 1);

    await expect(requireStaff()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('promotes on the row too, not only demotes', async () => {
    // The cookie says ADMIN and the row says CUSTOMER in every test above, so
    // this is the case that proves the guard reads the row rather than simply
    // refusing whatever the session claims.
    const user = await makeUser(Role.CUSTOMER);
    SESSION.user = { ...SESSION.user, role: Role.CUSTOMER };
    await db.user.update({ where: { id: user.id }, data: { role: Role.STAFF } });

    await expect(requireStaff()).resolves.toMatchObject({ role: Role.STAFF });
  });
});

describe('what the guard still takes from the session', () => {
  it('identity, and only identity', async () => {
    const user = await makeUser(Role.ADMIN);
    const staff = await requireStaff();
    expect(staff.id).toBe(user.id);
    expect(staff.email).toBe(user.email);
  });

  it('nothing at all when there is no session', async () => {
    SESSION.user = { ...SESSION.user, id: '' };
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(requireStaff()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
