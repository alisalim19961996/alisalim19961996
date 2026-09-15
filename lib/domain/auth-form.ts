import { normalizeIraqiPhone } from '../phone';

/**
 * Client-side validation for the four auth forms, without Zod.
 *
 * `schemas/auth.ts` did this, and its header said the same object validates
 * the form in the browser and the Server Action on the server. That was not
 * true of this module: **nothing on the server imported it.** better-auth does
 * its own validation behind `/api/auth/*`, so these four schemas were a
 * browser-only convenience — and they cost 353 kB of Zod, loaded on sign-in,
 * sign-up, both password-reset pages, and every page of the dashboard.
 *
 * The rules are small enough to read in one sitting, so they are written out.
 * Messages are **i18n keys**, never sentences, exactly as before: the UI
 * resolves them through next-intl, so a validation failure is never
 * English-only in an Arabic form.
 *
 * The server-side validation that actually counts has not moved and has not
 * changed — it was never here.
 */

/** Field name → message key. Empty means the form is good to submit. */
export type FieldErrors = Record<string, string>;

/**
 * A union, not an object with an optional field: `if (!result.ok) return;`
 * then narrows `values` to present, so a caller cannot read it without having
 * checked — which is the whole job of a validation result.
 *
 * `values` is normalised: trimmed, lower-cased, phone in E.164.
 */
export type FormResult<T> =
  { ok: true; errors: FieldErrors; values: T } | { ok: false; errors: FieldErrors };

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MAX_NAME = 120;
const MIN_NAME = 3;

/**
 * Deliberately permissive, and deliberately not a regex from the internet.
 *
 * The address is proved by sending to it, not by a pattern — every clever
 * expression rejects a valid address somebody actually owns. This rules out
 * the shapes that are certainly wrong: no @, nothing before or after it, a
 * space, or a domain with no dot.
 */
function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;

  const domain = value.slice(at + 1);
  return (
    domain.length > 2 &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.')
  );
}

/**
 * Trimmed and lower-cased BEFORE it is judged.
 *
 * The Zod chain this replaces validated first and trimmed after, so an address
 * an autofill had padded with a space was rejected as malformed — which reads,
 * to the customer, as the store not recognising their own email.
 */
function email(raw: string, errors: FieldErrors, field = 'email'): string {
  const value = raw.trim().toLowerCase();
  if (!looksLikeEmail(value)) errors[field] = 'invalidEmail';
  return value;
}

function password(raw: string, errors: FieldErrors, field = 'password'): string {
  if (raw.length < MIN_PASSWORD) errors[field] = 'passwordTooShort';
  else if (raw.length > MAX_PASSWORD) errors[field] = 'tooLong';
  return raw;
}

function confirmation(chosen: string, repeated: string, errors: FieldErrors): void {
  if (chosen !== repeated) errors['confirmPassword'] = 'passwordMismatch';
}

function result<T>(errors: FieldErrors, values: T): FormResult<T> {
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, errors, values };
}

export function validateSignIn(input: {
  email: string;
  password: string;
}): FormResult<{ email: string; password: string }> {
  const errors: FieldErrors = {};
  const address = email(input.email, errors);

  // Any password at all: the server decides whether it is the right one, and
  // "too short" on a sign-in form tells an attacker about the policy.
  if (input.password.length === 0) errors['password'] = 'required';

  return result(errors, { email: address, password: input.password });
}

export function validateSignUp(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}): FormResult<{
  name: string;
  email: string;
  phone: string | null;
  password: string;
}> {
  const errors: FieldErrors = {};

  const name = input.name.trim();
  if (name.length < MIN_NAME) errors['name'] = 'required';
  else if (name.length > MAX_NAME) errors['name'] = 'tooLong';

  const address = email(input.email, errors);

  // Optional, so an empty box is not an error — but a filled one must be a
  // real Iraqi number, normalised to E.164 the same way checkout does it.
  const typedPhone = input.phone.trim();
  let phone: string | null = null;
  if (typedPhone.length > 0) {
    phone = normalizeIraqiPhone(typedPhone);
    if (!phone) errors['phone'] = 'invalidPhone';
  }

  password(input.password, errors);
  confirmation(input.password, input.confirmPassword, errors);

  return result(errors, { name, email: address, phone, password: input.password });
}

export function validateForgotPassword(input: {
  email: string;
}): FormResult<{ email: string }> {
  const errors: FieldErrors = {};
  const address = email(input.email, errors);
  return result(errors, { email: address });
}

export function validateResetPassword(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): FormResult<{ token: string; password: string }> {
  const errors: FieldErrors = {};

  if (input.token.trim().length === 0) errors['token'] = 'required';
  password(input.password, errors);
  confirmation(input.password, input.confirmPassword, errors);

  return result(errors, { token: input.token, password: input.password });
}
