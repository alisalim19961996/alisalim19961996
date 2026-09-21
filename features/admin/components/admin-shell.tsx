import { Store } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { AdminNav } from './admin-nav';

/**
 * The dashboard's frame.
 *
 * Deliberately plain: the storefront is where design does the selling, and an
 * admin who processes forty orders a day wants density and predictable
 * positions, not atmosphere. Same tokens, no new ones.
 *
 * A server component. The only JavaScript is the sign-out button and the
 * navigation, which needs the current path to mark where you are standing.
 */

export interface AdminLabels {
  dashboard: string;
  orders: string;
  products: string;
  brands: string;
  categories: string;
  productTypes: string;
  attributes: string;
  users: string;
  settings: string;
  delivery: string;
  viewStore: string;
  guides: string;
  coupons: string;
  reviews: string;
  signOut: string;
  menu: string;
}

export function AdminShell({
  children,
  userName,
  userRole,
  labels,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  labels: AdminLabels;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="container-page flex h-16 items-center gap-4">
          <Logo />
          <span className="rounded-full bg-ink px-2 py-0.5 text-[0.6875rem] font-bold text-white">
            {labels.dashboard}
          </span>

          <div className="ms-auto flex items-center gap-3">
            <Link
              href="/"
              className="hidden items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              <Store className="size-4" aria-hidden />
              {labels.viewStore}
            </Link>
            <div className="hidden text-end sm:block">
              <p className="text-sm font-medium text-ink">{userName}</p>
              <p className="text-xs text-muted">{userRole}</p>
            </div>
            <SignOutButton label={labels.signOut} />
          </div>
        </div>
      </header>

      <div className="container-page flex flex-col gap-6 py-6 lg:flex-row lg:gap-10">
        <AdminNav labels={labels} />

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
