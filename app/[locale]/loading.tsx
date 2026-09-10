import { Skeleton } from '@/components/ui/skeleton';

export default function LocaleLoading() {
  return (
    <div className="container-page py-16">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div className="space-y-4">
          <Skeleton className="h-12 w-4/5" />
          <Skeleton className="h-12 w-3/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-40" />
          </div>
        </div>
        <Skeleton className="aspect-[4/5] w-full max-w-md justify-self-center" />
      </div>
    </div>
  );
}
