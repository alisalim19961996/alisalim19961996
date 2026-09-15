'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox, Field, FormSection, TextArea } from './form-fields';
import { AdminRecordForm } from './record-form';
import { deleteBlogPostAction, saveBlogPostAction } from '../actions';
import { slugify } from '@/lib/domain/product';
import type { BlogPostFormInput } from '@/schemas/blog';

/**
 * Write or edit a buying guide.
 *
 * One component for both, like every other admin form: a separate "create"
 * screen is how one of them ends up missing a field.
 *
 * Nothing points at a `BlogPost` — no order, no cart, no product — so delete
 * here is a real delete and needs no "deactivate instead" reason. That is the
 * only way this form differs from the taxonomy ones.
 */

interface State {
  slug: string;
  titleAr: string;
  titleEn: string;
  excerptAr: string;
  excerptEn: string;
  bodyAr: string;
  bodyEn: string;
  authorName: string;
  metaTitleAr: string;
  metaTitleEn: string;
  metaDescriptionAr: string;
  metaDescriptionEn: string;
  isPublished: boolean;
  publishedAt: string;
}

const EMPTY: State = {
  slug: '',
  titleAr: '',
  titleEn: '',
  excerptAr: '',
  excerptEn: '',
  bodyAr: '',
  bodyEn: '',
  authorName: '',
  metaTitleAr: '',
  metaTitleEn: '',
  metaDescriptionAr: '',
  metaDescriptionEn: '',
  isPublished: false,
  publishedAt: '',
};

/** `2026-09-15T14:30` — what `<input type="datetime-local">` reads and writes. */
function toLocalInputValue(date: Date | null): string {
  if (!date) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function BlogPostForm({ post }: { post?: BlogPostFormInput & { id: string } }) {
  const t = useTranslations('admin');
  const [state, setState] = useState<State>(
    post
      ? {
          slug: post.slug,
          titleAr: post.titleAr,
          titleEn: post.titleEn,
          excerptAr: post.excerptAr ?? '',
          excerptEn: post.excerptEn ?? '',
          bodyAr: post.bodyAr,
          bodyEn: post.bodyEn,
          authorName: post.authorName ?? '',
          metaTitleAr: post.metaTitleAr ?? '',
          metaTitleEn: post.metaTitleEn ?? '',
          metaDescriptionAr: post.metaDescriptionAr ?? '',
          metaDescriptionEn: post.metaDescriptionEn ?? '',
          isPublished: post.isPublished,
          publishedAt: toLocalInputValue(post.publishedAt),
        }
      : EMPTY,
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  return (
    <AdminRecordForm
      title={post ? t('editGuide') : t('newGuide')}
      id={post?.id}
      name={state.titleAr || state.titleEn}
      listHref="/admin/blog"
      save={() => saveBlogPostAction(state, post?.id)}
      remove={() => deleteBlogPostAction(post?.id ?? '')}
    >
      <FormSection title={t('identity')}>
        <Field
          label={t('guideTitleAr')}
          name="titleAr"
          value={state.titleAr}
          onChange={(event) => set('titleAr', event.target.value)}
          required
        />
        <Field
          label={t('guideTitleEn')}
          name="titleEn"
          value={state.titleEn}
          onChange={(event) => {
            set('titleEn', event.target.value);
            // Only while creating. A slug is a URL: changing it later breaks
            // every link a reader or Google already has (§6).
            if (!post) set('slug', slugify(event.target.value));
          }}
          required
        />
        <Field
          label={t('slug')}
          name="slug"
          hint={t('guideSlugHint')}
          value={state.slug}
          onChange={(event) => set('slug', event.target.value)}
          dir="ltr"
          required
        />
        <Field
          label={t('guideAuthor')}
          name="authorName"
          hint={t('guideAuthorHint')}
          value={state.authorName}
          onChange={(event) => set('authorName', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('guideBody')} hint={t('guideBodyHint')}>
        <TextArea
          label={t('guideBodyAr')}
          name="bodyAr"
          rows={16}
          wide
          value={state.bodyAr}
          onChange={(event) => set('bodyAr', event.target.value)}
          required
        />
        <TextArea
          label={t('guideBodyEn')}
          name="bodyEn"
          rows={16}
          wide
          dir="ltr"
          value={state.bodyEn}
          onChange={(event) => set('bodyEn', event.target.value)}
          required
        />
        <TextArea
          label={t('guideExcerptAr')}
          name="excerptAr"
          hint={t('guideExcerptHint')}
          value={state.excerptAr}
          onChange={(event) => set('excerptAr', event.target.value)}
        />
        <TextArea
          label={t('guideExcerptEn')}
          name="excerptEn"
          dir="ltr"
          value={state.excerptEn}
          onChange={(event) => set('excerptEn', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('publishing')} hint={t('guidePublishHint')}>
        <Checkbox
          label={t('published')}
          name="isPublished"
          checked={state.isPublished}
          onChange={(event) => set('isPublished', event.target.checked)}
        />
        <Field
          label={t('guidePublishedAt')}
          name="publishedAt"
          type="datetime-local"
          hint={t('guidePublishedAtHint')}
          value={state.publishedAt}
          onChange={(event) => set('publishedAt', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('seo')} hint={t('seoHint')}>
        <Field
          label={t('metaTitleAr')}
          name="metaTitleAr"
          value={state.metaTitleAr}
          onChange={(event) => set('metaTitleAr', event.target.value)}
        />
        <Field
          label={t('metaTitleEn')}
          name="metaTitleEn"
          dir="ltr"
          value={state.metaTitleEn}
          onChange={(event) => set('metaTitleEn', event.target.value)}
        />
        <TextArea
          label={t('metaDescriptionAr')}
          name="metaDescriptionAr"
          value={state.metaDescriptionAr}
          onChange={(event) => set('metaDescriptionAr', event.target.value)}
        />
        <TextArea
          label={t('metaDescriptionEn')}
          name="metaDescriptionEn"
          dir="ltr"
          value={state.metaDescriptionEn}
          onChange={(event) => set('metaDescriptionEn', event.target.value)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
