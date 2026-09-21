'use client';

import { useEffect } from 'react';

/**
 * Warn before leaving a form with unsaved work.
 *
 * The product form is the longest screen in the dashboard — six sections, a
 * variant matrix and a media list — and a stray reload or a closed tab threw
 * all of it away without a word.
 *
 * This covers a reload, a close and a typed URL. It deliberately does NOT
 * cover clicking a link inside the app: the App Router has no supported way to
 * block a client navigation, and the alternatives are either intercepting
 * every anchor or stashing a whole product draft in browser storage — which
 * the plan rules out and which would leave half-edited catalogue data sitting
 * in a shared browser. Half a guard that says what it covers beats a
 * mechanism nobody can reason about.
 *
 * The message itself is the browser's; every modern one ignores a custom
 * string, so none is supplied rather than pretending otherwise.
 */
export function useUnsavedWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
