import { headers } from 'next/headers';
import { Role } from '@prisma/client';
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
  };

  // A deactivated account must not keep working just because it holds a
  // still-valid session cookie.
  if (user.isActive === false) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
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

/** Require one of the given roles. */
export async function requireRole(...roles: readonly Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError(roles);
  return user;
}

/** Staff and admins can both reach the dashboard; only admins can destroy. */
export const requireStaff = () => requireRole(Role.STAFF, Role.ADMIN);
export const requireAdmin = () => requireRole(Role.ADMIN);

export function hasRole(user: SessionUser | null, ...roles: readonly Role[]): boolean {
  return user != null && roles.includes(user.role);
}
