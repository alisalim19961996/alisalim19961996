'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * Navigation drawer for phones.
 *
 * The desktop nav is plain links in the header; below `lg` there is no room for
 * five of them next to search and the cart, so they move here.
 *
 * Escape closes it and body scroll is locked while it is open — without the
 * lock, scrolling the drawer at its end scrolls the page underneath, which
 * makes the whole thing feel unfinished.
 */
export function MobileNav({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('menu')}
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-[--radius-control] text-ink transition-colors hover:bg-canvas lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />

          <div className="absolute inset-y-0 start-0 w-[78%] max-w-xs bg-surface p-5">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t('menu')}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeMenu')}
                className="grid size-9 place-items-center rounded-full text-ink hover:bg-canvas"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav aria-label={t('menu')}>
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-[--radius-control] px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="mt-6 space-y-1 border-t border-border pt-6">
                {[
                  { href: '/account', label: t('account') },
                  { href: '/wishlist', label: t('wishlist') },
                  { href: '/guides', label: t('guides') },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-[--radius-control] px-3 py-2.5 text-sm text-muted hover:bg-canvas hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
