import 'server-only';

import { Role } from '@prisma/client';
import { db } from '@/server/db/client';
import { requireAdmin } from '@/server/auth/guards';
import {
  refuseActivationChange,
  refuseRoleChange,
  type UserRole,
} from '@/lib/domain/user-roles';

/**
 * Handing out and taking back access.
 *
 * **There is no "create a staff account" here, deliberately.** The employee
 * registers themselves at `/sign-up` and the owner promotes them. The
 * alternative — an admin typing somebody else's password into a form — means
 * the owner knows a credential that is not theirs, and it would need this
 * module to hash passwords, which is better-auth's job and nobody else's (§7).
 * One extra step for the employee buys that.
 *
 * Every refusal comes from `lib/domain/user-roles.ts`, where it is unit-tested,
 * because each one guards against a state the app cannot recover from: a store
 * with no reachable ADMIN needs a database client to fix, which is the exact
 * situation this screen exists to end.
 */

export type UserAdminErrorCode =
  | 'notFound'
  | 'cannotChangeOwnRole'
  | 'cannotDeactivateSelf'
  | 'lastAdmin'
  | 'noChange';

export class UserAdminError extends Error {
  constructor(
    message: string,
    /** Key under the `admin` namespace in messages/, so the UI can translate it. */
    readonly code: UserAdminErrorCode,
  ) {
    super(message);
    this.name = 'UserAdminError';
  }
}

/** Live counts, read inside the same call that acts on them. */
async function readTarget(id: string) {
  const [target, activeAdminCount] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    }),
    db.user.count({ where: { role: Role.ADMIN, isActive: true } }),
  ]);

  if (!target) throw new UserAdminError('user not found', 'notFound');
  return { target, activeAdminCount };
}

export async function setUserRole(userId: string, nextRole: Role): Promise<void> {
  const actor = await requireAdmin();
  const { target, activeAdminCount } = await readTarget(userId);

  /*
    Counted from the database rather than from anything the form sent. The
    screen greys these controls too, but that is manners: a Server Action is a
    public endpoint and the guard is what protects the data (§7).
  */
  const refusal = refuseRoleChange({
    actorId: actor.id,
    targetId: target.id,
    currentRole: target.role as UserRole,
    nextRole: nextRole as UserRole,
    activeAdminCount,
  });
  if (refusal) throw new UserAdminError(`role change refused: ${refusal}`, refusal);

  await db.user.update({ where: { id: userId }, data: { role: nextRole } });
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const actor = await requireAdmin();
  const { target, activeAdminCount } = await readTarget(userId);

  const refusal = refuseActivationChange({
    actorId: actor.id,
    targetId: target.id,
    role: target.role as UserRole,
    nextActive: isActive,
    activeAdminCount,
  });
  if (refusal) throw new UserAdminError(`activation refused: ${refusal}`, refusal);

  if (target.isActive === isActive) return;

  /*
    Deactivating drops the account's sessions as well as the flag. The guard
    already rejects an inactive user holding a valid cookie (§7), so this is
    belt and braces — but it is the difference between "cannot act" and "is
    signed out", and a dismissed employee should see the latter immediately.
  */
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) await tx.session.deleteMany({ where: { userId } });
  });
}
