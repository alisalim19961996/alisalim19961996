/**
 * Every rule here exists because breaking it is unrecoverable from inside the
 * app: a store with no reachable ADMIN can only be fixed with a database
 * client, which is the situation the users screen was built to end.
 */
import { describe, expect, it } from 'vitest';
import {
  refuseActivationChange,
  refuseRoleChange,
  type UserRole,
} from '@/lib/domain/user-roles';

const base = {
  actorId: 'admin-1',
  targetId: 'user-2',
  currentRole: 'CUSTOMER' as UserRole,
  nextRole: 'STAFF' as UserRole,
  activeAdminCount: 2,
};

describe('changing a role', () => {
  it('allows an ordinary promotion', () => {
    expect(refuseRoleChange(base)).toBeNull();
  });

  it('refuses changing your own role, even with other admins around', () => {
    // Irreversible from where the person is standing: one click and the
    // dashboard is gone. "Ask a colleague" is not a recovery path for a shop
    // with two staff.
    expect(
      refuseRoleChange({
        ...base,
        targetId: base.actorId,
        currentRole: 'ADMIN',
        nextRole: 'STAFF',
        activeAdminCount: 5,
      }),
    ).toBe('cannotChangeOwnRole');
  });

  it('refuses demoting the last admin', () => {
    expect(
      refuseRoleChange({
        ...base,
        currentRole: 'ADMIN',
        nextRole: 'STAFF',
        activeAdminCount: 1,
      }),
    ).toBe('lastAdmin');
  });

  it('allows demoting an admin while another remains', () => {
    expect(
      refuseRoleChange({
        ...base,
        currentRole: 'ADMIN',
        nextRole: 'STAFF',
        activeAdminCount: 2,
      }),
    ).toBeNull();
  });

  it('allows promoting TO admin even when there is only one today', () => {
    // The count guards losing admins, never gaining them.
    expect(
      refuseRoleChange({
        ...base,
        currentRole: 'STAFF',
        nextRole: 'ADMIN',
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it('says nothing changed rather than pretending to save', () => {
    expect(refuseRoleChange({ ...base, currentRole: 'STAFF', nextRole: 'STAFF' })).toBe(
      'noChange',
    );
  });

  it('checks self before the admin count, so the message is the useful one', () => {
    // Both rules apply to the last admin demoting themselves. "You cannot
    // change your own role" tells them what to do; "no other admin exists"
    // sends them looking for a second account they do not need.
    expect(
      refuseRoleChange({
        ...base,
        targetId: base.actorId,
        currentRole: 'ADMIN',
        nextRole: 'CUSTOMER',
        activeAdminCount: 1,
      }),
    ).toBe('cannotChangeOwnRole');
  });
});

describe('activating and deactivating', () => {
  const activation = {
    actorId: 'admin-1',
    targetId: 'user-2',
    role: 'STAFF' as UserRole,
    nextActive: false,
    activeAdminCount: 2,
  };

  it('allows deactivating somebody else', () => {
    expect(refuseActivationChange(activation)).toBeNull();
  });

  it('refuses deactivating yourself', () => {
    // An inactive account is rejected even holding a valid session (§7).
    expect(
      refuseActivationChange({ ...activation, targetId: activation.actorId }),
    ).toBe('cannotDeactivateSelf');
  });

  it('refuses deactivating the last admin', () => {
    expect(
      refuseActivationChange({ ...activation, role: 'ADMIN', activeAdminCount: 1 }),
    ).toBe('lastAdmin');
  });

  it('never refuses switching somebody back on', () => {
    // Reactivating cannot reduce the number of admins, so nothing to guard.
    for (const role of ['CUSTOMER', 'STAFF', 'ADMIN'] as const) {
      expect(
        refuseActivationChange({
          ...activation,
          role,
          nextActive: true,
          activeAdminCount: 0,
          targetId: activation.actorId,
        }),
      ).toBeNull();
    }
  });
});
