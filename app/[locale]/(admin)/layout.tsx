import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AdminShell } from '@/features/admin/components/admin-shell';
import { getCurrentUser, isStaff } from '@/server/auth/guards';

/**
 * The admin tree.
 *
 * This layout is the *courtesy* guard: it redirects a visitor who should not
 * be here to sign-in instead of showing them a broken page. It is NOT the
 * protection. Every admin service call re-checks with `requireStaff()`,
 * because a Server Action can be invoked directly without this layout ever
 * rendering (CLAUDE.md §7).
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // `string`, not Locale: Next validates this against LayoutConfig<"/[locale]">,
  // whose params are `{ locale: string }`, and a narrower union is not
  // assignable in that (contravariant) position.
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();

  // Two different situations, two different destinations — conflating them
  // produced a redirect loop: a signed-in customer was sent to sign-in, which
  // saw a valid session and sent them straight back here.
  //
  // `return redirect(...)` rather than a bare call: next-intl's redirect is
  // destructured from createNavigation, so TypeScript only applies its
  // never-return narrowing when the result is returned.
  if (!user) return redirect({ href: '/sign-in?next=admin', locale });
  if (!isStaff(user)) return redirect({ href: '/', locale });

  const t = await getTranslations('admin');

  return (
    <AdminShell
      userName={user.name}
      userRole={user.role}
      labels={{
        dashboard: t('dashboard'),
        orders: t('orders'),
        products: t('products'),
        brands: t('brands'),
        categories: t('categories'),
        productTypes: t('productTypes'),
        attributes: t('attributes'),
        guides: t('guides'),
        users: t('users'),
        settings: t('settings'),
        delivery: t('delivery'),
        viewStore: t('viewStore'),
        signOut: t('signOut'),
        menu: t('menu'),
      }}
    >
      {children}
    </AdminShell>
  );
}
