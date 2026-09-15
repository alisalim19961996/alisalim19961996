'use client';

import type * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * The dashboard's form furniture.
 *
 * One definition, used by every admin form. Two forms with their own private
 * `Field` is how one of them ends up without the invalid state, or with a
 * label that is not tied to its input — an accessibility bug that only shows
 * up to the person using a screen reader.
 */

export function FormSection({
  title,
  hint,
  children,
  columns = 2,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-[--radius-card] border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className={cn('mt-4 grid gap-4', columns === 2 && 'sm:grid-cols-2')}>
        {children}
      </div>
    </section>
  );
}

/**
 * A section the owner opens when they need it.
 *
 * SEO overrides and long-form copy are real but rarely touched; leaving them
 * expanded turns the page into a wall and pushes the save button off screen.
 * `<details>` keeps them one click away with no JavaScript.
 */
export function CollapsibleSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-[--radius-card] border border-border bg-surface">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span className="flip-rtl text-muted transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
          {title}
        </span>
        {hint && <span className="ms-2 text-xs font-normal text-muted">{hint}</span>}
      </summary>
      <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
        {children}
      </div>
    </details>
  );
}

export interface FieldProps extends React.ComponentProps<'input'> {
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
}

export function Field({ label, hint, error, wide, id, ...props }: FieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input id={fieldId} aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export interface TextAreaProps extends React.ComponentProps<'textarea'> {
  label: string;
  hint?: string;
  wide?: boolean;
}

export function TextArea({ label, hint, wide, id, ...props }: TextAreaProps) {
  const fieldId = id ?? props.name;
  return (
    <div className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        className="w-full rounded-[--radius-control] border border-border-field bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-border-strong focus-visible:border-primary"
        {...props}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export interface SelectProps extends React.ComponentProps<'select'> {
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
}

export function Select({
  label,
  hint,
  error,
  wide,
  id,
  children,
  ...props
}: SelectProps) {
  const fieldId = id ?? props.name;
  return (
    <div className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className="h-11 w-full rounded-[--radius-control] border border-border-field bg-surface px-3 text-sm text-ink transition-colors hover:border-border-strong focus-visible:border-primary aria-invalid:border-danger"
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  hint,
  id,
  ...props
}: { label: string; hint?: string } & React.ComponentProps<'input'>) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={fieldId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded-[0.25rem] border-border text-primary accent-[--color-primary]"
        {...props}
      />
      <div>
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * One row of a repeatable list — an option, a variant, an image.
 *
 * The remove control sits at the row's end rather than after the fields, so a
 * long row on a phone does not hide it below the fold.
 */
export function RepeatableRow({
  children,
  onRemove,
  removeLabel,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="relative rounded-[--radius-control] border border-border bg-canvas p-4">
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="absolute end-2 top-2 grid size-8 place-items-center rounded-[--radius-control] text-muted transition-colors hover:bg-surface hover:text-danger"
      >
        &times;
      </button>
      <div className="grid gap-3 pe-8 sm:grid-cols-2">{children}</div>
    </div>
  );
}
