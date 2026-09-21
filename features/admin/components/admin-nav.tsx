'use client';

import {
  BookOpen,
  Boxes,
  FolderTree,
  LayoutDashboard,
  Package,
  Settings,
  Shapes,
  SlidersHorizontal,
  Star,
  Tags,
  TicketPercent,
  Truck,
  Users,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { AdminLabels } from './admin-shell';

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
  { href: '/admin/blog', labelKey: 'guides', icon: BookOpen },
  { href: '/admin/coupons', labelKey: 'coupons', icon: TicketPercent },
  { href: '/admin/reviews', labelKey: 'reviews', icon: Star },
  { href: '/admin/delivery', labelKey: 'delivery', icon: Truck },
  { href: '/admin/users', labelKey: 'users', icon: Users },
  { href: '/admin/settings', labelKey: 'settings', icon: Settings },
] as const;

/**
 * Which of the thirteen sections is open.
 *
 * The dashboard is a prefix of every other route, so it matches exactly and
 * the rest match their subtree — `/admin/products/new` has to light up
 * "products" or the owner is told they are nowhere.
 */
function isCurrent(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The dashboard's own navigation, and the one client component in its frame.
 *
 * It exists as a client component for one reason: a layout cannot read the
 * current path on the server, and thirteen links with nothing marking the one
 * you are standing on is a navigation that answers "where am I?" with silence.
 * `aria-current` carries that to a screen reader, and the background carries
 * it to everyone else — neither alone is enough.
 */
export function AdminNav({ labels }: { labels: AdminLabels }) {
  // Locale-stripped: `/ar/admin/orders` comes back as `/admin/orders`, which
  // is what NAV holds.
  const pathname = usePathname();

  return (
    <nav
      aria-label={labels.menu}
      className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:w-56 lg:shrink-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-1 lg:flex-col">
        {NAV.map((item) => {
          const Icon = item.icon;
          const current = isCurrent(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex w-full items-center gap-2 rounded-control px-3 py-2',
                  'text-sm font-medium transition-colors',
                  current
                    ? 'bg-primary-soft text-primary'
                    : 'text-ink-soft hover:bg-surface hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {labels[item.labelKey]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
