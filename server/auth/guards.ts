import 'server-only';

import { headers } from 'next/headers';
import { Role } from '@prisma/client';
import { db } from '@/server/db/client';
import { auth } from './auth';

/**
 * Authorisation guards.
 *
 * Middleware protects the route; these guards protect the data. Every admin
 * service call re-checks here, because a route guard alone is bypassed the
 * moment a Server Action is invoked directly.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** Optional: nothing in MPS requires a phone on the account itself. */
  phone: string | null;
  role: Role;
  isActive: boolean;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends Error {
  constructor(required: readonly Role[]) {
    super(`Requires one of: ${required.join(', ')}`);
    this.name = 'ForbiddenError';
  }
}

/** Current user, or null when signed out. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    role?: string;
    isActive?: boolean;
    phone?: string | null;
  };

  // A deactivated account must not keep working just because it holds a
  // still-valid session cookie.
  if (user.isActive === false) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: (user.role as Role) ?? Role.CUSTOMER,
    isActive: user.isActive ?? true,
  };
}

/** Current user or throw. Use in any action that requires a signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/**
 * Require one of the given roles, deciding from the database rather than from
 * the session cookie.
 *
 * `session.cookieCache` is on with a five-minute window (server/auth/auth.ts),
 * which is what keeps `getCurrentUser()` off the database on every page. It
 * also means the `role` and `isActive` in a session result can be up to five
 * minutes stale — so a dismissed employee kept working for five more minutes,
 * and a demoted one kept their old powers for the same window. On the screens
 * this guard protects, that window is customer addresses and the ability to
 * change an order.
 *
 * So identity comes from the session and authority comes from the row. One
 * indexed read by primary key, only on role-gated calls: `getCurrentUser()`
 * and `requireUser()` are untouched, so the cart and the storefront still cost
 * nothing.
 */
export async function requireRole(...roles: readonly Role[]): Promise<SessionUser> {
  const user = await requireUser();

  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, isActive: true },
  });

  // Deleted between the session read and now, or deactivated: either way this
  // is no longer somebody who may act.
  if (!fresh || !fresh.isActive) throw new UnauthenticatedError();
  if (!roles.includes(fresh.role)) throw new ForbiddenError(roles);

  return { ...user, role: fresh.role, isActive: fresh.isActive };
}

/** Staff and admins can both reach the dashboard; only admins can destroy. */
export const requireStaff = () => requireRole(Role.STAFF, Role.ADMIN);
export const requireAdmin = () => requireRole(Role.ADMIN);

/**
 * A type predicate, so `if (!hasRole(user, …)) return redirect(…)` narrows the
 * user to non-null afterwards instead of forcing a cast.
 */
export function hasRole(
  user: SessionUser | null,
  ...roles: readonly Role[]
): user is SessionUser {
  return user != null && roles.includes(user.role);
}

/**
 * Can this user open the dashboard?
 *
 * Exists so a layout can ask without importing the `Role` enum: the UI layers
 * may only import types from Prisma, never values (eslint.config.mjs), and
 * that rule is what keeps the data layer swappable from the components' side.
 */
export function isStaff(user: SessionUser | null): user is SessionUser {
  return hasRole(user, Role.STAFF, Role.ADMIN);
}

/** Only admins may destroy things or change another user's role. */
export function isAdmin(user: SessionUser | null): user is SessionUser {
  return hasRole(user, Role.ADMIN);
}
