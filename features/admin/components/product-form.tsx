'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Save } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  Checkbox,
  CollapsibleSection,
  Field,
  FormSection,
  Select,
  TextArea,
} from './form-fields';
import { ProductAttributeFields } from './product-attribute-fields';
import {
  EMPTY_VARIANT,
  ProductVariantsEditor,
  type OptionState,
  type VariantState,
} from './product-variants-editor';
import {
  ProductMediaEditor,
  type ImageState,
  type VideoState,
} from './product-media-editor';
import { saveProductAction, type SaveProductActionResult } from '../actions';
import { slugify } from '@/lib/domain/product';
// One import per line: the guardrail that keeps server code out of client
// bundles reads line by line, and a wrapped `import type { … }` hides the
// `type` keyword from it. It errs towards false positives, which is the right
// direction for that check — so the import bends, not the rule.
import type { ProductFormReference } from '@/server/queries/admin-products';
import type { ProductFormValues } from '@/server/queries/admin-products';
import type { Locale } from '@/i18n/routing';
import { useUnsavedWarning } from '@/components/ui/use-unsaved-warning';

/**
 * Add or edit a product.
 *
 * One component for both, because they are the same form — a second "create"
 * form is how one of them ends up missing a field. The only difference is
 * whether an id goes with the save.
 *
 * The specification fields are not written here: they come from the chosen
 * product type's `ProductTypeAttribute` rows (CLAUDE.md §6). Choosing
 * "tablet" instead of "phone" redraws them, and a product type added later
 * brings its own fields with it.
 */

interface FormState {
  slug: string;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  productTypeId: string;
  brandId: string;
  categoryId: string;
  isPublished: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  warrantyMonths: string;
  warrantyNoteAr: string;
  warrantyNoteEn: string;
  overviewAr: string;
  overviewEn: string;
  keyFeaturesAr: string;
  keyFeaturesEn: string;
  prosAr: string;
  prosEn: string;
  consAr: string;
  consEn: string;
  whoIsItForAr: string;
  whoIsItForEn: string;
  thingsToKnowAr: string;
  thingsToKnowEn: string;
  metaTitleAr: string;
  metaTitleEn: string;
  metaDescriptionAr: string;
  metaDescriptionEn: string;
  attributes: Record<string, string>;
  options: OptionState[];
  variants: VariantState[];
  images: ImageState[];
  videos: VideoState[];
}

/** Bullet lists are edited as lines and stored as an array. */
const toLines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const fromLines = (values: string[]): string => values.join('\n');

function initialState(
  product: ProductFormValues | null,
  reference: ProductFormReference,
): FormState {
  if (!product) {
    return {
      slug: '',
      nameAr: '',
      nameEn: '',
      taglineAr: '',
      taglineEn: '',
      productTypeId: reference.productTypes[0]?.id ?? '',
      brandId: reference.brands[0]?.id ?? '',
      categoryId: reference.categories[0]?.id ?? '',
      isPublished: false,
      isFeatured: false,
      isNewArrival: false,
      isBestSeller: false,
      warrantyMonths: '12',
      warrantyNoteAr: '',
      warrantyNoteEn: '',
      overviewAr: '',
      overviewEn: '',
      keyFeaturesAr: '',
      keyFeaturesEn: '',
      prosAr: '',
      prosEn: '',
      consAr: '',
      consEn: '',
      whoIsItForAr: '',
      whoIsItForEn: '',
      thingsToKnowAr: '',
      thingsToKnowEn: '',
      metaTitleAr: '',
      metaTitleEn: '',
      metaDescriptionAr: '',
      metaDescriptionEn: '',
      attributes: {},
      options: [],
      variants: [{ ...EMPTY_VARIANT }],
      images: [],
      videos: [],
    };
  }

  return {
    ...product,
    warrantyMonths: String(product.warrantyMonths),
    keyFeaturesAr: fromLines(product.keyFeaturesAr),
    keyFeaturesEn: fromLines(product.keyFeaturesEn),
    prosAr: fromLines(product.prosAr),
    prosEn: fromLines(product.prosEn),
    consAr: fromLines(product.consAr),
    consEn: fromLines(product.consEn),
    variants: product.variants.map((variant) => ({
      ...variant,
      priceIqd: String(variant.priceIqd),
    })),
  };
}

export function ProductForm({
  product,
  reference,
  locale,
  uploadEnabled,
}: {
  product: ProductFormValues | null;
  reference: ProductFormReference;
  locale: Locale;
  /** False when no storage is configured; the form then asks for a path. */
  uploadEnabled: boolean;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [values, setValues] = useState<FormState>(() =>
    initialState(product, reference),
  );
  const [result, setResult] = useState<SaveProductActionResult>({ ok: false });
  const [pending, startTransition] = useTransition();

  /**
   * What was on screen when the form opened, and again after each save.
   *
   * Serialised rather than held as an object so the comparison is one string
   * equality instead of a deep walk of a form that contains a variant matrix.
   * State, not a ref: a ref read during render is exactly the bug
   * `react-hooks` refuses, and this one changes twice in a session.
   */
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(values));
  useUnsavedWarning(JSON.stringify(values) !== savedSnapshot);

  const isEdit = product !== null;
  const patch = (next: Partial<FormState>) =>
    setValues((current) => ({ ...current, ...next }));

  const selectedType = useMemo(
    () => reference.productTypes.find((type) => type.id === values.productTypeId),
    [reference.productTypes, values.productTypeId],
  );

  const localised = <T extends { nameAr: string; nameEn: string }>(item: T) =>
    locale === 'ar' ? item.nameAr : item.nameEn;

  /**
   * Follow the English name until the owner takes over.
   *
   * Only while creating: an existing slug is a live URL that customers have
   * bookmarked and Google has indexed, so it never moves on its own.
   */
  const onNameEnChange = (nameEn: string) => {
    const autoSlug = !isEdit && values.slug === slugify(values.nameEn);
    patch({ nameEn, ...(autoSlug ? { slug: slugify(nameEn) } : {}) });
  };

  const submit = () => {
    const payload = {
      ...values,
      warrantyMonths: values.warrantyMonths,
      keyFeaturesAr: toLines(values.keyFeaturesAr),
      keyFeaturesEn: toLines(values.keyFeaturesEn),
      prosAr: toLines(values.prosAr),
      prosEn: toLines(values.prosEn),
      consAr: toLines(values.consAr),
      consEn: toLines(values.consEn),
      // Only the chosen type's attributes are sent: leaving a previous type's
      // answers in the payload would have the server reject the whole save.
      attributes: Object.fromEntries(
        (selectedType?.attributes ?? []).map((attribute) => [
          attribute.key,
          values.attributes[attribute.key] ?? '',
        ]),
      ),
      options: values.options,
      variants: values.variants.map((variant) => ({
        ...variant,
        // The picker's selects are positional, so a product with no options
        // must not carry stale selections from before they were removed.
        optionValues: values.options.map(
          (_, index) => variant.optionValues[index] ?? '',
        ),
      })),
    };

    startTransition(async () => {
      const result = await saveProductAction(product?.id ?? null, payload);
      setResult(result);
      if (result.ok) {
        // The baseline moves to what was actually accepted, so the warning
        // stops firing for work that is now in the database.
        setSavedSnapshot(JSON.stringify(values));
      }
      if (result.ok && !isEdit && result.productId) {
        router.push(`/admin/products/${result.productId}`);
      }
    });
  };

  return (
    <form
      className="space-y-6 pb-24"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* -- Identity ----------------------------------------------------- */}
      <FormSection title={t('basics')}>
        <Field
          name="nameAr"
          label={t('productNameAr')}
          value={values.nameAr}
          required
          onChange={(event) => patch({ nameAr: event.target.value })}
        />
        <Field
          name="nameEn"
          label={t('productNameEn')}
          value={values.nameEn}
          dir="ltr"
          required
          onChange={(event) => onNameEnChange(event.target.value)}
        />
        <Field
          name="slug"
          label={t('slug')}
          hint={isEdit ? t('slugEditHint') : t('slugHint')}
          value={values.slug}
          dir="ltr"
          required
          error={
            result.errorKey === 'slugTaken'
              ? t('slugTaken')
              : result.field === 'slug'
                ? t('invalidSlug')
                : undefined
          }
          onChange={(event) => patch({ slug: event.target.value })}
        />
        <Field
          name="warrantyMonths"
          label={t('warrantyMonths')}
          value={values.warrantyMonths}
          inputMode="numeric"
          className="numeric"
          dir="ltr"
          onChange={(event) => patch({ warrantyMonths: event.target.value })}
        />
        <Field
          name="taglineAr"
          label={t('taglineAr')}
          hint={t('taglineHint')}
          value={values.taglineAr}
          onChange={(event) => patch({ taglineAr: event.target.value })}
        />
        <Field
          name="taglineEn"
          label={t('taglineEn')}
          value={values.taglineEn}
          dir="ltr"
          onChange={(event) => patch({ taglineEn: event.target.value })}
        />
      </FormSection>

      {/* -- Taxonomy ----------------------------------------------------- */}
      <FormSection title={t('classification')} hint={t('classificationHint')}>
        <Select
          name="productTypeId"
          label={t('productType')}
          value={values.productTypeId}
          onChange={(event) => patch({ productTypeId: event.target.value })}
        >
          {reference.productTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {localised(type)}
            </option>
          ))}
        </Select>
        <Select
          name="brandId"
          label={t('brand')}
          value={values.brandId}
          onChange={(event) => patch({ brandId: event.target.value })}
        >
          {reference.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {localised(brand)}
            </option>
          ))}
        </Select>
        <Select
          name="categoryId"
          label={t('category')}
          value={values.categoryId}
          onChange={(event) => patch({ categoryId: event.target.value })}
        >
          {reference.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {localised(category)}
            </option>
          ))}
        </Select>
      </FormSection>

      {/* -- Specifications, drawn from the chosen type -------------------- */}
      <FormSection title={t('specifications')} hint={t('specificationsHint')}>
        <ProductAttributeFields
          attributes={selectedType?.attributes ?? []}
          values={values.attributes}
          locale={locale}
          errorField={result.errorKey === 'invalidAttribute' ? result.field : undefined}
          onChange={(key, value) =>
            patch({ attributes: { ...values.attributes, [key]: value } })
          }
        />
      </FormSection>

      {/* -- Options and variants ------------------------------------------ */}
      <ProductVariantsEditor
        options={values.options}
        variants={values.variants}
        slug={values.slug}
        uploadEnabled={uploadEnabled}
        locale={locale}
        errorField={result.field}
        onOptionsChange={(options) => patch({ options })}
        onVariantsChange={(variants) => patch({ variants })}
      />

      {/* -- Media --------------------------------------------------------- */}
      <ProductMediaEditor
        images={values.images}
        videos={values.videos}
        slug={values.slug}
        uploadEnabled={uploadEnabled}
        errorField={result.field}
        onImagesChange={(images) => patch({ images })}
        onVideosChange={(videos) => patch({ videos })}
      />

      {/* -- Merchandising -------------------------------------------------- */}
      <FormSection title={t('merchandising')} hint={t('merchandisingHint')}>
        <Checkbox
          name="isPublished"
          label={t('published')}
          hint={t('publishedHint')}
          checked={values.isPublished}
          onChange={(event) => patch({ isPublished: event.target.checked })}
        />
        <Checkbox
          name="isFeatured"
          label={t('featured')}
          checked={values.isFeatured}
          onChange={(event) => patch({ isFeatured: event.target.checked })}
        />
        <Checkbox
          name="isNewArrival"
          label={t('newArrival')}
          checked={values.isNewArrival}
          onChange={(event) => patch({ isNewArrival: event.target.checked })}
        />
        <Checkbox
          name="isBestSeller"
          label={t('bestSeller')}
          checked={values.isBestSeller}
          onChange={(event) => patch({ isBestSeller: event.target.checked })}
        />
      </FormSection>

      {/* -- Long-form copy -------------------------------------------------- */}
      <CollapsibleSection title={t('description')} hint={t('descriptionHint')}>
        <TextArea
          name="overviewAr"
          label={t('overviewAr')}
          value={values.overviewAr}
          rows={5}
          onChange={(event) => patch({ overviewAr: event.target.value })}
        />
        <TextArea
          name="overviewEn"
          label={t('overviewEn')}
          value={values.overviewEn}
          dir="ltr"
          rows={5}
          onChange={(event) => patch({ overviewEn: event.target.value })}
        />
        <TextArea
          name="keyFeaturesAr"
          label={t('keyFeaturesAr')}
          hint={t('onePerLine')}
          value={values.keyFeaturesAr}
          onChange={(event) => patch({ keyFeaturesAr: event.target.value })}
        />
        <TextArea
          name="keyFeaturesEn"
          label={t('keyFeaturesEn')}
          hint={t('onePerLine')}
          value={values.keyFeaturesEn}
          dir="ltr"
          onChange={(event) => patch({ keyFeaturesEn: event.target.value })}
        />
        <TextArea
          name="prosAr"
          label={t('prosAr')}
          hint={t('onePerLine')}
          value={values.prosAr}
          onChange={(event) => patch({ prosAr: event.target.value })}
        />
        <TextArea
          name="prosEn"
          label={t('prosEn')}
          hint={t('onePerLine')}
          value={values.prosEn}
          dir="ltr"
          onChange={(event) => patch({ prosEn: event.target.value })}
        />
        <TextArea
          name="consAr"
          label={t('consAr')}
          hint={t('consHint')}
          value={values.consAr}
          onChange={(event) => patch({ consAr: event.target.value })}
        />
        <TextArea
          name="consEn"
          label={t('consEn')}
          hint={t('onePerLine')}
          value={values.consEn}
          dir="ltr"
          onChange={(event) => patch({ consEn: event.target.value })}
        />
        <TextArea
          name="whoIsItForAr"
          label={t('whoIsItForAr')}
          value={values.whoIsItForAr}
          onChange={(event) => patch({ whoIsItForAr: event.target.value })}
        />
        <TextArea
          name="whoIsItForEn"
          label={t('whoIsItForEn')}
          value={values.whoIsItForEn}
          dir="ltr"
          onChange={(event) => patch({ whoIsItForEn: event.target.value })}
        />
        <TextArea
          name="thingsToKnowAr"
          label={t('thingsToKnowAr')}
          value={values.thingsToKnowAr}
          onChange={(event) => patch({ thingsToKnowAr: event.target.value })}
        />
        <TextArea
          name="thingsToKnowEn"
          label={t('thingsToKnowEn')}
          value={values.thingsToKnowEn}
          dir="ltr"
          onChange={(event) => patch({ thingsToKnowEn: event.target.value })}
        />
        <TextArea
          name="warrantyNoteAr"
          label={t('warrantyNoteAr')}
          value={values.warrantyNoteAr}
          onChange={(event) => patch({ warrantyNoteAr: event.target.value })}
        />
        <TextArea
          name="warrantyNoteEn"
          label={t('warrantyNoteEn')}
          value={values.warrantyNoteEn}
          dir="ltr"
          onChange={(event) => patch({ warrantyNoteEn: event.target.value })}
        />
      </CollapsibleSection>

      {/* -- SEO ------------------------------------------------------------- */}
      <CollapsibleSection title={t('seo')} hint={t('seoHint')}>
        <Field
          name="metaTitleAr"
          label={t('metaTitleAr')}
          value={values.metaTitleAr}
          onChange={(event) => patch({ metaTitleAr: event.target.value })}
        />
        <Field
          name="metaTitleEn"
          label={t('metaTitleEn')}
          value={values.metaTitleEn}
          dir="ltr"
          onChange={(event) => patch({ metaTitleEn: event.target.value })}
        />
        <TextArea
          name="metaDescriptionAr"
          label={t('metaDescriptionAr')}
          value={values.metaDescriptionAr}
          onChange={(event) => patch({ metaDescriptionAr: event.target.value })}
        />
        <TextArea
          name="metaDescriptionEn"
          label={t('metaDescriptionEn')}
          value={values.metaDescriptionEn}
          dir="ltr"
          onChange={(event) => patch({ metaDescriptionEn: event.target.value })}
        />
      </CollapsibleSection>

      {/* -- Save ------------------------------------------------------------ */}
      {/*
        Sticky, because this form is long enough that a save button at the
        bottom is a scroll away from every field that needs it.
      */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center gap-3 py-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            {isEdit ? t('saveChanges') : t('createProduct')}
          </Button>

          {result.ok && (
            <p className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" aria-hidden />
              {t('saved')}
            </p>
          )}
          {result.ok && (result.deactivatedVariantCount ?? 0) > 0 && (
            <p className="text-sm text-warning">
              {t('variantsDeactivated', { count: result.deactivatedVariantCount ?? 0 })}
            </p>
          )}
          {result.errorKey && (
            <p role="alert" className="text-sm text-danger">
              {t(result.errorKey)}
              {result.field ? ` — ${result.field}` : ''}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
