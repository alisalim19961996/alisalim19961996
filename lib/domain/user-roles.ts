/**
 * Who may change whom, and what must never be possible.
 *
 * Pure so the rules can be unit-tested (§17). Every one of them exists because
 * the alternative is unrecoverable from inside the app: a store with no
 * reachable ADMIN can only be fixed with a database client, which is the exact
 * situation this screen was built to end.
 */

export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface RoleChange {
  /** The admin performing it. */
  actorId: string;
  targetId: string;
  currentRole: UserRole;
  nextRole: UserRole;
  /** How many active ADMINs exist right now, the target included. */
  activeAdminCount: number;
}

export type RoleRefusal = 'cannotChangeOwnRole' | 'lastAdmin' | 'noChange';

/**
 * `null` means allowed.
 *
 * The two refusals are different failures. Changing your OWN role is refused
 * even when other admins exist: the click is irreversible from where you are
 * standing, and "ask a colleague to put it back" is not a recovery path a shop
 * with two staff has. Demoting the LAST admin is refused for the harder
 * reason — nobody is left who could undo it.
 */
export function refuseRoleChange(change: RoleChange): RoleRefusal | null {
  if (change.currentRole === change.nextRole) return 'noChange';
  if (change.actorId === change.targetId) return 'cannotChangeOwnRole';

  const losesAdmin = change.currentRole === 'ADMIN' && change.nextRole !== 'ADMIN';
  if (losesAdmin && change.activeAdminCount <= 1) return 'lastAdmin';

  return null;
}

export interface ActivationChange {
  actorId: string;
  targetId: string;
  role: UserRole;
  nextActive: boolean;
  activeAdminCount: number;
}

export type ActivationRefusal = 'cannotDeactivateSelf' | 'lastAdmin';

/**
 * Deactivating is as final as demoting: `getCurrentUser()` returns null for an
 * inactive account even with a valid session cookie (§7), so the last admin
 * switching themselves off empties the dashboard permanently.
 */
export function refuseActivationChange(
  change: ActivationChange,
): ActivationRefusal | null {
  if (change.nextActive) return null;

  if (change.actorId === change.targetId) return 'cannotDeactivateSelf';
  if (change.role === 'ADMIN' && change.activeAdminCount <= 1) return 'lastAdmin';

  return null;
}

/** Roles an admin may assign, in the order the UI offers them. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['CUSTOMER', 'STAFF', 'ADMIN'];
