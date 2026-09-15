'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { setBlogPostPublishedAction } from '../actions';

/**
 * Publish or withdraw a guide from the list, in one click.
 *
 * Only publishing lives here. Deleting an article is not reversible, so it
 * stays inside the article it would delete, behind a confirmation that names
 * it — the same split as the products list, and for the same reason.
 */
export function BlogPublishToggle({
  id,
  isPublished,
}: {
  id: string;
  isPublished: boolean;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title={isPublished ? t('unpublish') : t('publish')}
      onClick={() =>
        startTransition(async () => {
          await setBlogPostPublishedAction({ id, isPublished: !isPublished });
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : isPublished ? (
        <EyeOff aria-hidden />
      ) : (
        <Eye aria-hidden />
      )}
      <span className="sr-only sm:not-sr-only">
        {isPublished ? t('unpublish') : t('publish')}
      </span>
    </Button>
  );
}
