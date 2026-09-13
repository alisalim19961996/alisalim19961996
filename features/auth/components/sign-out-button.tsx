'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { signOut } from '../auth-client';

/**
 * Sign out.
 *
 * Goes through better-auth's HTTP endpoint like sign-in does, so the session
 * row is deleted server-side rather than the cookie merely being dropped — a
 * cookie the browser forgets is still a valid session anywhere else it was
 * copied to.
 *
 * `router.refresh()` after it, because every server-rendered page above this
 * one was built for a signed-in user.
 */
export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          router.replace('/');
          router.refresh();
        })
      }
    >
      <LogOut aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
