'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { PRIMARY_NAV, SECONDARY_NAV } from '@/config/nav';

/**
 * Navigation drawer for phones.
 *
 * The desktop nav is plain links in the header; below `lg` there is no room for
 * five of them next to search and the cart, so they move here.
 *
 * Escape closes it and body scroll is locked while it is open — without the
 * lock, scrolling the drawer at its end scrolls the page underneath, which
 * makes the whole thing feel unfinished.
 *
 * **It also traps focus, and that is not polish.** The panel carries
 * `aria-modal="true"`, which tells a screen reader that everything behind it
 * is inert. Without the trap that was a false statement: Tab walked straight
 * out of the drawer and into the page underneath, which the reader had already
 * been told was not there. Focus moves in on open and returns to the button
 * that opened it on close, so a keyboard user is never left standing on
 * nothing.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusable = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      // Wrap at both ends. Without this the next Tab leaves for the page
      // behind, which `aria-modal` has just promised is not there.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    // The close button, not the first link: opening a menu should not read out
    // as "phones" before saying what just happened.
    focusable()[0]?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Returned to the opener rather than left on a removed node, where the
  // browser drops focus to <body> and the next Tab restarts from the top.
  useEffect(() => {
    if (!open) opener.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <button
        ref={opener}
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
                      className="block rounded-[--radius-control] px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
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
                      className="block rounded-[--radius-control] px-3 py-2.5 text-sm text-muted hover:bg-canvas hover:text-ink"
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
