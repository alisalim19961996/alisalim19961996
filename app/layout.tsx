import type { ReactNode } from 'react';

/**
 * Root layout is intentionally a pass-through: <html> and <body> are owned by
 * app/[locale]/layout.tsx, which is the only place that knows the locale and
 * therefore the text direction.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
