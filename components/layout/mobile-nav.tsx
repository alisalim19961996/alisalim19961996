'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { PRIMARY_NAV, SECONDARY_NAV } from '@/config/nav';
import { useFocusTrap } from '@/components/ui/use-focus-trap';

/**
 * Navigation drawer for phones.
 *
 * The desktop nav is plain links in the header; below `lg` there is no room for
 * five of them next to search and the cart, so they move here.
 *
 * Escape, the focus trap and the scroll lock come from `useFocusTrap`, which
 * the catalogue's filter drawer uses too — see it for why `aria-modal` without
 * a trap is a false statement rather than a missing nicety.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useFocusTrap({ open, onClose: () => setOpen(false), opener });

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('menu')}
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-control text-ink transition-colors hover:bg-canvas lg:hidden"
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

          <div
            ref={panel}
            className="absolute inset-y-0 start-0 w-[78%] max-w-xs bg-surface p-5"
          >
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
                {PRIMARY_NAV.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-control px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="mt-6 space-y-1 border-t border-border pt-6">
                {SECONDARY_NAV.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-control px-3 py-2.5 text-sm text-muted hover:bg-canvas hover:text-ink"
                    >
                      {t(link.labelKey)}
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
