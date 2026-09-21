'use client';

import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, RepeatableRow } from './form-fields';
import { ImageUploadButton } from './image-upload-button';

/**
 * Photographs and videos.
 *
 * Images are either uploaded to Supabase Storage or referenced by a path under
 * `public/`. Those are the only two `next.config.ts` will render, so they are
 * the only two the field accepts — a box taking any URL would let the owner
 * save something that silently refuses to appear on the storefront.
 *
 * Order is editable because the first image is the one the catalogue card,
 * the share preview and the order confirmation all use — "which photo leads"
 * is a merchandising decision, not an accident of insertion order.
 */

export interface ImageState {
  url: string;
  altAr: string;
  altEn: string;
}

export interface VideoState {
  url: string;
  titleAr: string;
  titleEn: string;
}

export function ProductMediaEditor({
  images,
  videos,
  slug,
  uploadEnabled,
  errorField,
  onImagesChange,
  onVideosChange,
}: {
  images: ImageState[];
  videos: VideoState[];
  /** Groups uploaded objects into a folder named after the product. */
  slug: string;
  uploadEnabled: boolean;
  errorField?: string;
  onImagesChange: (images: ImageState[]) => void;
  onVideosChange: (videos: VideoState[]) => void;
}) {
  const t = useTranslations('admin');

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;
    onImagesChange(next);
  };

  const patchImage = (index: number, patch: Partial<ImageState>) =>
    onImagesChange(
      images.map((image, i) => (i === index ? { ...image, ...patch } : image)),
    );

  const patchVideo = (index: number, patch: Partial<VideoState>) =>
    onVideosChange(
      videos.map((video, i) => (i === index ? { ...video, ...patch } : video)),
    );

  return (
    <div className="space-y-6">
      {/* -- Images ------------------------------------------------------- */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('images')}</h2>
            <p className="mt-1 text-xs text-muted">{t('imagesHint')}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ImageUploadButton
              slug={slug}
              enabled={uploadEnabled}
              multiple
              onUploaded={(urls) =>
                onImagesChange([
                  ...images,
                  ...urls.map((url) => ({ url, altAr: '', altEn: '' })),
                ])
              }
            />
            {/*
              Still here when uploads are configured: the owner may already
              have the file sitting in public/, and taking the path box away
              would make that the wrong way to do it rather than a second way.
            */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onImagesChange([...images, { url: '', altAr: '', altEn: '' }])
              }
            >
              <Plus aria-hidden />
              {t('addImage')}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {images.map((image, index) => (
            <RepeatableRow
              key={index}
              removeLabel={t('remove')}
              onRemove={() => onImagesChange(images.filter((_, i) => i !== index))}
            >
              <ImagePreview url={image.url} isMain={index === 0} />
              <Field
                name={`image-${index}-url`}
                label={index === 0 ? t('mainImagePath') : t('imagePath')}
                hint={t('imagePathHint')}
                value={image.url}
                dir="ltr"
                wide
                error={
                  errorField?.startsWith(`images.${index}.url`)
                    ? t('imageMustBeLocal')
                    : undefined
                }
                onChange={(event) => patchImage(index, { url: event.target.value })}
              />
              <Field
                name={`image-${index}-altAr`}
                label={t('altTextAr')}
                hint={t('altTextHint')}
                value={image.altAr}
                onChange={(event) => patchImage(index, { altAr: event.target.value })}
              />
              <Field
                name={`image-${index}-altEn`}
                label={t('altTextEn')}
                value={image.altEn}
                dir="ltr"
                onChange={(event) => patchImage(index, { altEn: event.target.value })}
              />

              <div className="flex gap-1 sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden />
                  {t('moveUp')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                  {t('moveDown')}
                </Button>
              </div>
            </RepeatableRow>
          ))}
        </div>
      </section>

      {/* -- Videos ------------------------------------------------------- */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('videos')}</h2>
            <p className="mt-1 text-xs text-muted">{t('videosHint')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onVideosChange([...videos, { url: '', titleAr: '', titleEn: '' }])
            }
          >
            <Plus aria-hidden />
            {t('addVideo')}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {videos.map((video, index) => (
            <RepeatableRow
              key={index}
              removeLabel={t('remove')}
              onRemove={() => onVideosChange(videos.filter((_, i) => i !== index))}
            >
              <Field
                name={`video-${index}-url`}
                label={t('videoUrl')}
                hint={t('videoUrlHint')}
                value={video.url}
                dir="ltr"
                wide
                error={
                  errorField === video.url && video.url !== ''
                    ? t('invalidVideoUrl')
                    : undefined
                }
                onChange={(event) => patchVideo(index, { url: event.target.value })}
              />
              <Field
                name={`video-${index}-titleAr`}
                label={t('videoTitleAr')}
                value={video.titleAr}
                onChange={(event) => patchVideo(index, { titleAr: event.target.value })}
              />
              <Field
                name={`video-${index}-titleEn`}
                label={t('videoTitleEn')}
                value={video.titleEn}
                dir="ltr"
                onChange={(event) => patchVideo(index, { titleEn: event.target.value })}
              />
            </RepeatableRow>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * What the owner is about to publish, at thumbnail size.
 *
 * A path box alone answers "is this the right photograph?" with a string.
 * The first image is the one every card and every search result shows, so it
 * carries a badge as well — its position in the list is the rule, and a rule
 * you have to know is not a rule the screen has told you.
 *
 * A plain `<img>`, not `next/image`: this URL is whatever was typed, and
 * `next/image` throws on a host that is not in `remotePatterns` — which would
 * take the whole form down over a mistyped domain. A broken thumbnail is the
 * correct answer to a broken path.
 */
function ImagePreview({ url, isMain }: { url: string; isMain: boolean }) {
  const t = useTranslations('admin');

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control border border-border bg-canvas">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            aria-hidden
            className="size-full object-contain"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="size-5 text-subtle" aria-hidden />
        )}
      </div>
      {isMain && (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
          {t('mainImage')}
        </span>
      )}
    </div>
  );
}
