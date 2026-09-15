'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, UserCheck, UserX } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { setUserActiveAction, setUserRoleAction } from '../actions';
// The domain's own union rather than Prisma's enum: identical strings, and it
// keeps the layer boundary intact without a type-only import of the database
// client into a component.
import type { UserRole } from '@/lib/domain/user-roles';

/**
 * The two controls on a user row, and the reasons they refuse.
 *
 * Both are disabled rather than hidden when a rule forbids them, with the
 * reason on the control itself — the same choice as the sold-product delete
 * (§9). An absent control reads as a missing feature; a disabled one that
 * explains itself reads as a rule.
 *
 * The service re-checks every rule regardless. This is manners, not
 * protection: a Server Action is a public endpoint (§7).
 */

export function UserRoleSelect({
  userId,
  role,
  roles,
  labels,
  disabledReason,
}: {
  userId: string;
  role: UserRole;
  roles: readonly UserRole[];
  labels: Record<string, string>;
  disabledReason?: string;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <select
        value={role}
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason}
        aria-label={t('role')}
        onChange={(event) => {
          const next = event.target.value as UserRole;
          setErrorKey(null);
          startTransition(async () => {
            const result = await setUserRoleAction({ userId, role: next });
            if (!result.ok) {
              setErrorKey(result.errorKey ?? 'actionFailed');
              return;
            }
            router.refresh();
          });
        }}
        className="h-9 rounded-[--radius-control] border border-border-field bg-surface px-2 text-sm text-ink transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {roles.map((value) => (
          <option key={value} value={value}>
            {labels[value]}
          </option>
        ))}
      </select>
      {errorKey && (
        <p role="alert" className="text-xs text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}

export function UserActiveToggle({
  userId,
  isActive,
  disabledReason,
}: {
  userId: string;
  isActive: boolean;
  disabledReason?: string;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const label = isActive ? t('deactivateUser') : t('activateUser');

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason ?? label}
        aria-label={label}
        onClick={() => {
          if (isActive && !window.confirm(t('confirmDeactivate'))) return;
          setErrorKey(null);
          startTransition(async () => {
            const result = await setUserActiveAction({ userId, isActive: !isActive });
            if (!result.ok) {
              setErrorKey(result.errorKey ?? 'actionFailed');
              return;
            }
            router.refresh();
          });
        }}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-[--radius-control] border px-3 text-sm transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-60',
          isActive
            ? 'border-border text-muted hover:border-danger hover:text-danger'
            : 'border-border text-success hover:border-success',
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : isActive ? (
          <UserX className="size-4" aria-hidden />
        ) : (
          <UserCheck className="size-4" aria-hidden />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {errorKey && (
        <p role="alert" className="text-xs text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
