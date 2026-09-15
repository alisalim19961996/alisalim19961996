'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox, Field, FormSection, Select, TextArea } from './form-fields';
import { AdminRecordForm } from './record-form';
import { saveCategoryAction, deleteCategoryAction } from '../actions';
import { slugify } from '@/lib/domain/product';
import { descendantIds, flattenTree } from '@/lib/domain/taxonomy';
import type { CategoryFormValues } from '@/server/queries/admin-taxonomy';
import type { TaxonomyReference } from '@/server/queries/admin-taxonomy';
import type { Locale } from '@/i18n/routing';

/**
 * Add or edit a category.
 *
 * The parent picker is the whole difficulty. A category cannot descend from
 * itself, and the failure is not a crash: the loop detaches from every root,
 * so the branch vanishes from the tree and from the storefront's navigation
 * with its products still attached. The service refuses it, and this list
 * never offers it — the owner should not be able to click the mistake.
 */

interface State {
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  imageUrl: string;
  parentId: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: State = {
  slug: '',
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
  imageUrl: '',
  parentId: '',
  isActive: true,
  sortOrder: '0',
};

export function CategoryForm({
  category,
  categories,
  locale,
  productCount = 0,
  childCount = 0,
}: {
  category?: CategoryFormValues;
  categories: TaxonomyReference['categories'];
  locale: Locale;
  productCount?: number;
  childCount?: number;
}) {
  const t = useTranslations('admin');
  const [state, setState] = useState<State>(
    category
      ? {
          slug: category.slug,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          descriptionAr: category.descriptionAr ?? '',
          descriptionEn: category.descriptionEn ?? '',
          imageUrl: category.imageUrl ?? '',
          parentId: category.parentId ?? '',
          isActive: category.isActive,
          sortOrder: String(category.sortOrder),
        }
      : EMPTY,
  );

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((previous) => ({ ...previous, [key]: value }));

  const parentChoices = useMemo(() => {
    const forbidden = category
      ? descendantIds(categories, category.id)
      : new Set<string>();
    return flattenTree(categories)
      .filter((row) => !forbidden.has(row.node.id))
      .map((row) => ({
        id: row.node.id,
        // Non-breaking spaces, because a `<option>` collapses ordinary ones
        // and every level would render flush left.
        label: `${'  '.repeat(row.depth)}${
          locale === 'ar' ? row.node.nameAr : row.node.nameEn
        }`,
      }));
  }, [categories, category, locale]);

  const deleteBlockedReason =
    productCount > 0
      ? t('categoryHasProducts', { count: productCount })
      : childCount > 0
        ? t('categoryHasChildren', { count: childCount })
        : undefined;

  return (
    <AdminRecordForm
      title={category ? t('editCategory') : t('newCategory')}
      id={category?.id}
      name={state.nameAr || state.nameEn}
      listHref="/admin/categories"
      save={() => saveCategoryAction(state, category?.id)}
      remove={() => deleteCategoryAction(category?.id ?? '')}
      deleteBlockedReason={deleteBlockedReason}
    >
      <FormSection title={t('identity')}>
        <Field
          label={t('nameAr')}
          name="nameAr"
          value={state.nameAr}
          onChange={(event) => set('nameAr', event.target.value)}
          required
        />
        <Field
          label={t('nameEn')}
          name="nameEn"
          value={state.nameEn}
          onChange={(event) => {
            set('nameEn', event.target.value);
            if (!category) set('slug', slugify(event.target.value));
          }}
          required
        />
        <Field
          label={t('slug')}
          name="slug"
          hint={t('slugHint')}
          value={state.slug}
          onChange={(event) => set('slug', event.target.value)}
          dir="ltr"
          required
        />
        <Select
          label={t('parentCategory')}
          name="parentId"
          hint={t('parentCategoryHint')}
          value={state.parentId}
          onChange={(event) => set('parentId', event.target.value)}
        >
          <option value="">{t('noParent')}</option>
          {parentChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </Select>
        <Field
          label={t('sortOrder')}
          name="sortOrder"
          type="number"
          min={0}
          hint={t('sortOrderHint')}
          value={state.sortOrder}
          onChange={(event) => set('sortOrder', event.target.value)}
        />
        <Field
          label={t('imageUrl')}
          name="imageUrl"
          hint={t('imagePathHint')}
          value={state.imageUrl}
          onChange={(event) => set('imageUrl', event.target.value)}
          dir="ltr"
        />
        <TextArea
          label={t('descriptionAr')}
          name="descriptionAr"
          value={state.descriptionAr}
          onChange={(event) => set('descriptionAr', event.target.value)}
        />
        <TextArea
          label={t('descriptionEn')}
          name="descriptionEn"
          value={state.descriptionEn}
          onChange={(event) => set('descriptionEn', event.target.value)}
        />
      </FormSection>

      <FormSection title={t('visibility')} columns={1}>
        <Checkbox
          label={t('isActive')}
          name="isActive"
          hint={t('categoryActiveHint')}
          checked={state.isActive}
          onChange={(event) => set('isActive', event.target.checked)}
        />
      </FormSection>
    </AdminRecordForm>
  );
}
