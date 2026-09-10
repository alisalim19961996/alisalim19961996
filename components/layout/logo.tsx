import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Wordmark, drawn in type rather than shipped as an image so it stays crisp at
 * any size and costs no extra request. Replaced by the real logo once the brand
 * asset exists, via SiteSetting.logoUrl.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('inline-flex items-baseline gap-1.5', className)}
      aria-label="MPS — Modern Phone Store"
    >
      <span className="text-xl font-bold tracking-tight text-ink">MPS</span>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
    </Link>
  );
}
