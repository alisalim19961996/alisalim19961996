'use server';

import { saveDeliveryAddress, updateProfile } from '@/server/services/account';
import { profileSchema, savedAddressSchema } from '@/schemas/account';
import { revalidateAccount } from '@/server/revalidate';

/**
 * The customer's own details.
 *
 * Nothing identifies the account: `updateProfile` takes the id from the
 * session. A form that posted a user id would be one crafted request away from
 * renaming somebody else.
 */

export interface ProfileState {
  status: 'idle' | 'saved' | 'error';
  /** Field name -> message key under `validation`. */
  fieldErrors?: Record<string, string>;
  errorKey?: string;
}

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { status: 'error', fieldErrors };
  }

  try {
    await updateProfile(parsed.data);
  } catch (error) {
    console.error('[account] updating the profile failed', error);
    return { status: 'error', errorKey: 'actionFailed' };
  }

  revalidateAccount();
  return { status: 'saved' };
}

/**
 * The saved delivery address.
 *
 * Its own action and its own state, so a failed address does not wipe the
 * name the customer just corrected in the form above it — and so the "saved"
 * confirmation names the thing that was actually saved.
 */
export async function saveAddressAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = savedAddressSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    governorate: formData.get('governorate'),
    city: formData.get('city'),
    addressLine: formData.get('addressLine'),
    notes: formData.get('notes') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { status: 'error', fieldErrors };
  }

  try {
    await saveDeliveryAddress(parsed.data);
  } catch (error) {
    console.error('[account] saving the delivery address failed', error);
    return { status: 'error', errorKey: 'actionFailed' };
  }

  revalidateAccount();
  return { status: 'saved' };
}
