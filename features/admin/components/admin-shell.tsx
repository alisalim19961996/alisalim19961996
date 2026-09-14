import {
  Boxes,
  FolderTree,
  LayoutDashboard,
  Package,
  Settings,
  Shapes,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/layout/logo';
import { SignOutButton } from '@/features/auth/components/sign-out-button';

/**
 * The dashboard's frame.
 *
 * Deliberately plain: the storefront is where design does the selling, and an
 * admin who processes forty orders a day wants density and predictable
 * positions, not atmosphere. Same tokens, no new ones.
 *
 * A server component — the only JavaScript here is the sign-out button.
 */

export interface AdminLabels {
  dashboard: string;
  orders: string;
  products: string;
  brands: string;
  categories: string;
  productTypes: string;
  attributes: string;
  settings: string;
  delivery: string;
  viewStore: string;
  signOut: string;
  menu: string;
}

/**
 * Daily work first, then the catalogue, then the shape of it.
 *
 * Orders and products are opened every day; brands and categories a few times
 * a month; product types and specifications when something genuinely new is
 * being sold. Ordering by frequency rather than by how the database is
 * arranged is what keeps the two-tap targets where the hand expects them.
 */
const NAV = [
  { href: '/admin', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', labelKey: 'orders', icon: Package },
  { href: '/admin/products', labelKey: 'products', icon: Boxes },
  { href: '/admin/brands', labelKey: 'brands', icon: Tags },
  { href: '/admin/categories', labelKey: 'categories', icon: FolderTree },
  { href: '/admin/product-types', labelKey: 'productTypes', icon: Shapes },
  { href: '/admin/attributes', labelKey: 'attributes', icon: SlidersHorizontal },
  { href: '/admin/delivery', labelKey: 'delivery', icon: Truck },
  { href: '/admin/settings', labelKey: 'settings', icon: Settings },
] as const;

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
        {/*
          A horizontal scroller on phones and a sidebar from lg. A drawer would
          be wrong here: the dashboard's sections are few and switched between
          constantly, so one tap beats two.
        */}
        <nav
          aria-label={labels.menu}
          className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:w-52 lg:shrink-0 lg:overflow-visible lg:px-0"
        >
          <ul className="flex gap-1 lg:flex-col">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    className="inline-flex w-full items-center gap-2 rounded-[--radius-control] px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {labels[item.labelKey]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
