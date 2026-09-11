'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/video';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export interface GalleryImage {
  id: string;
  url: string;
  altAr: string | null;
  altEn: string | null;
  isDemo: boolean;
}

export interface GalleryVideo {
  id: string;
  videoId: string;
  titleAr: string | null;
  titleEn: string | null;
}

/**
 * Product gallery.
 *
 * Videos sit in the same strip as the images, because a review video is part of
 * how someone decides — burying it below the specifications means nobody finds
 * it.
 *
 * The player is never loaded up front. Until the shopper presses play they get
 * the thumbnail and a button; the iframe is created only on that click. An
 * embedded YouTube player costs several hundred kilobytes and sets third-party
 * cookies on a page most visitors never press play on.
 */
export function ProductGallery({
  images,
  videos,
  productName,
}: {
  images: GalleryImage[];
  videos: GalleryVideo[];
  productName: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('product');
  const isAr = locale === 'ar';

  type Slide =
    | { kind: 'image'; key: string; image: GalleryImage }
    | { kind: 'video'; key: string; video: GalleryVideo };

  const slides: Slide[] = [
    ...images.map((image) => ({ kind: 'image' as const, key: image.id, image })),
    ...videos.map((video) => ({ kind: 'video' as const, key: video.id, video })),
  ];

  const [activeKey, setActiveKey] = useState(slides[0]?.key ?? '');
  const [playing, setPlaying] = useState(false);

  const active = slides.find((slide) => slide.key === activeKey) ?? slides[0];

  if (!active) {
    return (
      <div className="aspect-[4/5] rounded-[--radius-panel] border border-border bg-canvas" />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[--radius-panel] border border-border bg-canvas">
        {active.kind === 'image' ? (
          <>
            <Image
              src={active.image.url}
              alt={(isAr ? active.image.altAr : active.image.altEn) ?? productName}
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              priority
              className="object-cover"
            />
            {active.image.isDemo && (
              <Badge variant="demo" className="absolute start-4 top-4">
                DEMO
              </Badge>
            )}
          </>
        ) : playing ? (
          <iframe
            src={youtubeEmbedUrl(active.video.videoId)}
            title={(isAr ? active.video.titleAr : active.video.titleEn) ?? productName}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 size-full"
            aria-label={t('playVideo')}
          >
            {/*
              A plain img, not next/image: this is a third-party thumbnail and
              routing it through the optimiser would mean allow-listing an
              external host for one decorative frame.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={youtubeThumbnailUrl(active.video.videoId)}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
            <span className="absolute inset-0 grid place-items-center bg-ink/25 transition-colors group-hover:bg-ink/35">
              <span className="grid size-16 place-items-center rounded-full bg-white/95 shadow-[--shadow-raised]">
                <Play className="size-6 translate-x-0.5 fill-ink text-ink" />
              </span>
            </span>
          </button>
        )}
      </div>

      {slides.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {slides.map((slide) => {
            const isActive = slide.key === activeKey;
            return (
              <li key={slide.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveKey(slide.key);
                    setPlaying(false);
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'relative size-16 overflow-hidden rounded-[--radius-control] border-2 transition-colors',
                    isActive
                      ? 'border-ink'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  {slide.kind === 'image' ? (
                    <Image
                      src={slide.image.url}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center bg-ink text-white">
                      <Play className="size-4 fill-current" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
