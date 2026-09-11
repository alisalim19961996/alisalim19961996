import { getTranslations } from 'next-intl/server';
import { ShoppingBag, Heart, User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';
import { MobileNav } from './mobile-nav';
import { HeaderSearch } from '@/features/search/components/search-box';

/**
 * Header.
 *
 * A Server Component; only search, the language switcher and the mobile menu
 * ship JavaScript. Navigation itself is plain links, so it works before
 * hydration and costs nothing.
 */
export async function SiteHeader() {
  const t = await getTranslations('nav');

  const links = [
    { href: '/products?type=phone', label: t('phones') },
    { href: '/products?type=tablet', label: t('tablets') },
    { href: '/products?type=accessory', label: t('accessories') },
    { href: '/brands', label: t('brands') },
    { href: '/offers', label: t('offers') },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-3">
        <MobileNav links={links} />
        <Logo />

        <nav aria-label={t('menu')} className="hidden items-center gap-0.5 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[--radius-control] px-3 py-2 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <HeaderSearch />
          <LanguageSwitcher className="mx-1" />

          <IconLink
            href="/wishlist"
            label={t('wishlist')}
            className="hidden sm:inline-flex"
          >
            <Heart />
          </IconLink>
          <IconLink
            href="/account"
            label={t('account')}
            className="hidden sm:inline-flex"
          >
            <User />
          </IconLink>
          <IconLink href="/cart" label={t('cart')}>
            <ShoppingBag />
          </IconLink>
        </div>
      </div>
    </header>
  );
}

function IconLink({
  href,
  label,
  children,
  className,
}: {
  href: '/wishlist' | '/account' | '/cart';
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`inline-flex size-10 items-center justify-center rounded-[--radius-control] text-ink transition-colors hover:bg-canvas [&_svg]:size-5 ${className ?? ''}`}
    >
      {children}
    </Link>
  );
}
