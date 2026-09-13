import { setRequestLocale } from 'next-intl/server';

/**
 * Auth pages stand alone: no header, no footer, no navigation.
 *
 * A sign-in screen with the full storefront chrome invites the visitor to
 * wander off mid-task, and the header's cart and search are meaningless here.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // `string`, not Locale: Next validates this against LayoutConfig<"/[locale]">,
  // and a narrower union is not assignable in that position.
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div className="bg-canvas">{children}</div>;
}
