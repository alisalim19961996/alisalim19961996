'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Pick a photograph and get back the URL to store.
 *
 * The browser never talks to Supabase: the file is posted to MPS, which checks
 * it and forwards it with a key the browser never sees. That is the whole
 * reason for the proxy — a signed upload URL handed to the client would move
 * the "is this really a photograph?" check to the client, where it is advice.
 *
 * `accept` on the input is a convenience for the file picker and nothing more.
 * What a file *is* gets decided server-side from its bytes
 * (`lib/domain/image-file.ts`); this attribute only saves the owner from
 * scrolling past their documents folder.
 */
export function ImageUploadButton({
  slug,
  enabled,
  multiple = false,
  size = 'sm',
  onUploaded,
}: {
  /** Groups the uploaded objects into a readable folder. */
  slug: string;
  enabled: boolean;
  multiple?: boolean;
  size?: 'sm' | 'md';
  onUploaded: (urls: string[]) => void;
}) {
  const t = useTranslations('admin');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (!enabled) {
    return <p className="text-xs text-muted">{t('uploadNotConfigured')}</p>;
  }

  const upload = async (files: FileList) => {
    setPending(true);
    setErrorKey(null);
    const urls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        // Only a folder name; the stored object never reuses the file's own.
        body.append('slug', slug || 'product');

        const response = await fetch('/api/admin/upload', { method: 'POST', body });
        const result: unknown = await response.json().catch(() => null);

        const ok =
          typeof result === 'object' &&
          result !== null &&
          (result as { ok?: unknown }).ok === true;

        if (!ok) {
          const key = (result as { errorKey?: unknown } | null)?.errorKey;
          setErrorKey(typeof key === 'string' ? key : 'uploadFailed');
          // Stop at the first failure rather than pressing on: a rejected
          // batch usually means every file has the same problem.
          break;
        }
        urls.push(String((result as { url: unknown }).url));
      }

      if (urls.length > 0) onUploaded(urls);
    } catch {
      setErrorKey('uploadFailed');
    } finally {
      setPending(false);
      // Clear the input so choosing the same file again still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) void upload(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Upload aria-hidden />
        )}
        {t('uploadImage')}
      </Button>
      {errorKey && (
        <p role="alert" className="text-xs text-danger">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
