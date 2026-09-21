import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Search } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UserActiveToggle,
  UserRoleSelect,
} from '@/features/admin/components/user-row-actions';
import { getAdminUsers } from '@/server/queries/admin-users';
import { getCurrentUser, isAdmin } from '@/server/auth/guards';
import { ASSIGNABLE_ROLES, type UserRole } from '@/lib/domain/user-roles';
import { formatIraqiPhone } from '@/lib/phone';
import type { Locale } from '@/i18n/routing';
import { dateFormatter } from '@/lib/datetime';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('users'), robots: { index: false, follow: false } };
}

/**
 * Everyone with an account, and who may do what.
 *
 * **A staff account is made by promoting someone who registered**, not by
 * typing a password into this screen: an admin should never know a credential
 * that is not theirs, and hashing is better-auth's job (§7). The hint at the
 * top says so, because otherwise the missing "add user" button reads as a
 * missing feature.
 *
 * The controls are greyed where a rule forbids the change, with the reason on
 * the control. The service refuses it again in every case — this is manners,
 * and the guard is what protects the data.
 */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('admin');
  const actor = await getCurrentUser();

  /*
    Checked before the query, not after: `getAdminUsers()` calls
    `requireAdmin()` and throws, which would show a staff member an error page
    instead of a sentence. Same shape as the settings screen — the service
    still refuses them, this is only about what they read.
  */
  if (!isAdmin(actor)) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted">{t('adminOnly')}</p>
      </div>
    );
  }

  const one = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const roleParam = one('role');
  const role = ASSIGNABLE_ROLES.includes(roleParam as never)
    ? (roleParam as UserRole)
    : undefined;

  const pageParam = Number(one('page'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const { rows, total, pageCount, activeAdminCount } = await getAdminUsers({
    q: one('q'),
    role,
    page,
  });

  const roleLabels = Object.fromEntries(
    ASSIGNABLE_ROLES.map((value) => [value, t(`role_${value}`)]),
  );

  const dateFormat = dateFormatter(locale);

  /** Why a control is off, or undefined when it is available. */
  const roleBlockedBecause = (row: (typeof rows)[number]) => {
    if (actor && row.id === actor.id) return t('cannotChangeOwnRole');
    if (row.role === 'ADMIN' && row.isActive && activeAdminCount <= 1) {
      return t('lastAdmin');
    }
    return undefined;
  };

  const activeBlockedBecause = (row: (typeof rows)[number]) => {
    if (!row.isActive) return undefined;
    if (actor && row.id === actor.id) return t('cannotDeactivateSelf');
    if (row.role === 'ADMIN' && activeAdminCount <= 1) return t('lastAdmin');
    return undefined;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">{t('users')}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">{t('usersHint')}</p>
      </div>

      <nav aria-label={t('filterByRole')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1">
          {[undefined, ...ASSIGNABLE_ROLES].map((value) => {
            const active = role === value;
            return (
              <li key={value ?? 'all'} className="shrink-0">
                <Link
                  href={`/admin/users${value ? `?role=${value}` : ''}`}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'inline-flex items-center rounded-control bg-ink px-3 py-1.5 text-sm font-medium text-white'
                      : 'inline-flex items-center rounded-control px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink'
                  }
                >
                  {value ? roleLabels[value] : t('allUsers')}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action="/admin/users" className="flex gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={one('q') ?? ''}
          placeholder={t('searchUsers')}
          aria-label={t('searchUsers')}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          <Search aria-hidden />
          <span className="sr-only sm:not-sr-only">{t('search')}</span>
        </Button>
      </form>

      <p className="text-sm text-muted numeric">{t('userTotal', { count: total })}</p>

      {rows.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-sm text-muted">
          {t('noUsers')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  {row.name}
                  {actor && row.id === actor.id && (
                    <Badge variant="neutral">{t('you')}</Badge>
                  )}
                  {!row.isActive && <Badge variant="danger">{t('deactivated')}</Badge>}
                </p>
                <p className="truncate text-xs text-muted numeric">{row.email}</p>
                <p className="mt-0.5 text-xs text-subtle numeric">
                  {row.phone ? `${formatIraqiPhone(row.phone)} · ` : ''}
                  {t('orderCount', { count: row.orderCount })} ·{' '}
                  {dateFormat.format(row.createdAt)}
                </p>
              </div>

              <UserRoleSelect
                userId={row.id}
                role={row.role}
                roles={ASSIGNABLE_ROLES}
                labels={roleLabels}
                disabledReason={roleBlockedBecause(row)}
              />

              <UserActiveToggle
                userId={row.id}
                isActive={row.isActive}
                disabledReason={activeBlockedBecause(row)}
              />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          aria-label={t('pagination')}
          className="flex items-center justify-center gap-3"
        >
          {page > 1 && (
            <Link
              href={`/admin/users?page=${page - 1}`}
              className="rounded-control border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-border-strong"
            >
              {t('previous')}
            </Link>
          )}
          <span className="text-sm text-muted numeric">
            {page} / {pageCount}
          </span>
          {page < pageCount && (
            <Link
              href={`/admin/users?page=${page + 1}`}
              className="rounded-control border border-border px-4 py-2 text-sm text-ink transition-colors hover:border-border-strong"
            >
              {t('next')}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
