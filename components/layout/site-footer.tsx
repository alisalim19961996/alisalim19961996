import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Logo } from './logo';

export async function SiteFooter() {
  const [tNav, tBrand, tFooter] = await Promise.all([
    getTranslations('nav'),
    getTranslations('brand'),
    getTranslations('footer'),
  ]);

  const columns = [
    {
      title: tFooter('shop'),
      links: [
        { href: '/products', label: tNav('products') },
        { href: '/brands', label: tNav('brands') },
        { href: '/offers', label: tNav('offers') },
      ],
    },
    {
      title: tFooter('company'),
      links: [
        { href: '/about', label: tNav('about') },
        { href: '/guides', label: tNav('guides') },
        { href: '/contact', label: tNav('contact') },
      ],
    },
  ] as const;

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      {/*
        Extra bottom padding on small screens reserves room for the product
        page's fixed buy bar. It lives here rather than on that page because the
        footer is the last element in the document — anything earlier still
        leaves the footer's own rows underneath the bar. On a footer the cost is
        invisible; a covered copyright line is not.
      */}
      <div className="container-page pt-12 pb-24 lg:pb-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {tBrand('tagline')}
            </p>
          </div>

          <div className="flex gap-12">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-xs font-semibold tracking-wide text-subtle uppercase">
                  {column.title}
                </h2>
                <ul className="mt-3 space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-subtle">
            © {new Date().getFullYear()} {tBrand('fullName')}
          </p>
        </div>
      </div>
    </footer>
  );
}
