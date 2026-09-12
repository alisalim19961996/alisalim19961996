import { Skeleton } from '@/components/ui/skeleton';

/**
 * Catalogue loading state.
 *
 * Shaped like the real grid rather than a generic spinner, so the page does not
 * visibly reflow when the products arrive.
 */
export default function ProductsLoading() {
  return (
    <div className="container-page py-8 lg:py-12">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="hidden w-64 shrink-0 space-y-7 lg:block">
          {Array.from({ length: 3 }, (_, group) => (
            <div key={group} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          ))}
        </div>

        <ul className="grid min-w-0 flex-1 grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="space-y-3">
              <Skeleton className="aspect-product w-full" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-1/2" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
