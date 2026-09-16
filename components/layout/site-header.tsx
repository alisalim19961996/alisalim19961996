import { getTranslations } from 'next-intl/server';
import { Heart, ShoppingBag, User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { MobileNav } from './mobile-nav';
import { HeaderSearch } from '@/features/search/components/search-box';
import { HEADER_ACTIONS, PRIMARY_NAV } from '@/config/nav';
import { CartCountBadge } from '@/features/cart/components/cart-count-badge';
import { cn } from '@/lib/utils';

/**
 * Header.
 *
 * A Server Component; only search, the language switcher and the mobile nav
 * ship JavaScript. Navigation itself is plain links, so it works before
 * hydration and costs nothing.
 *
 * The links come from config/nav.ts, shared with the mobile drawer and the
 * footer — so a new section appears everywhere at once.
 */
const ACTION_ICONS = {
  Heart,
  User,
  ShoppingBag,
} as const;

export async function SiteHeader() {
  const t = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-3">
        <MobileNav />
        <Logo />

        <nav aria-label={t('menu')} className="hidden items-center gap-0.5 lg:flex">
          {PRIMARY_NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <HeaderSearch />
          <LanguageSwitcher className="mx-1" />

          {HEADER_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action.icon];
            const isCart = action.href === '/cart';
            return (
              <Link
                key={action.href}
                href={action.href}
                aria-label={t(action.labelKey)}
                // cn(), not a template literal: `hidden` and `inline-flex`
                // are both display utilities, so a plain string leaves CSS
                // source order to decide — and `inline-flex` won, which meant
                // `desktopOnly` hid nothing and the phone header carried 13
                // controls. tailwind-merge drops the loser for us.
                className={cn(
                  'relative inline-flex size-10 items-center justify-center rounded-control text-ink transition-colors hover:bg-canvas [&_svg]:size-5',
                  action.desktopOnly && 'hidden sm:inline-flex',
                )}
              >
                <Icon />
                {/*
                  The only part of the header that is not static. Reading the
                  cart cookie here would opt every route in the app into
                  dynamic rendering, so the count loads after hydration.
                */}
                {isCart && <CartCountBadge />}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
