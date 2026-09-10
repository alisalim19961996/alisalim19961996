import { getTranslations } from 'next-intl/server';
import { Search, ShoppingBag, Heart, User } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';
import { LanguageSwitcher } from './language-switcher';

/**
 * Header is a Server Component: only the language switcher ships JavaScript.
 * The full navigation, search overlay and cart drawer arrive in Phase 2.
 */
export async function SiteHeader() {
  const t = await getTranslations('nav');

  const links = [
    { href: '/products', label: t('products') },
    { href: '/brands', label: t('brands') },
    { href: '/offers', label: t('offers') },
    { href: '/guides', label: t('guides') },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />

        <nav
          aria-label={t('menu')}
          className="hidden items-center gap-1 md:flex"
        >
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
          <LanguageSwitcher className="me-1" />

          <IconLink href="/search" label={t('search')}>
            <Search />
          </IconLink>
          <IconLink href="/wishlist" label={t('wishlist')} className="hidden sm:inline-flex">
            <Heart />
          </IconLink>
          <IconLink href="/account" label={t('account')} className="hidden sm:inline-flex">
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
  href: '/search' | '/wishlist' | '/account' | '/cart';
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
