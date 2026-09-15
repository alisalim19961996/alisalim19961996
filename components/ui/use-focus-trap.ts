'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keyboard behaviour for a modal panel: trap, Escape, and return.
 *
 * One implementation, used by both drawers. The mobile nav had this written
 * inline and the filter drawer had none at all, which is how the second copy
 * would have drifted from the first (§13.16).
 *
 * It exists because `aria-modal="true"` is a claim, not a behaviour: it tells
 * a screen reader that everything behind the panel is inert. Both drawers said
 * that while Tab walked straight out into the page underneath — so the reader
 * was announcing content it had just been told was not there.
 *
 * Returns the ref to put on the panel. Pass the element that opened it so
 * focus can go home: without that the browser drops focus to `<body>` when the
 * panel unmounts, and the next Tab restarts from the top of the page.
 */
export function useFocusTrap({
  open,
  onClose,
  opener,
}: {
  open: boolean;
  onClose: () => void;
  opener?: RefObject<HTMLElement | null>;
}): RefObject<HTMLDivElement | null> {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusable = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Scroll is locked too: without it, reaching the end of the panel scrolls
    // the page underneath, which makes the whole thing feel unfinished.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    focusable()[0]?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) opener?.current?.focus({ preventScroll: true });
  }, [open, opener]);

  return panel;
}
