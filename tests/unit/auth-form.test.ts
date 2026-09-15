import { describe, expect, it } from 'vitest';
import {
  validateForgotPassword,
  validateResetPassword,
  validateSignIn,
  validateSignUp,
} from '@/lib/domain/auth-form';

/**
 * These replaced four Zod schemas that were loaded in the browser and nowhere
 * else, at 353 kB. The rules have to be exactly as strict as before and the
 * message keys exactly the same, because the forms render them through
 * next-intl — a key that drifts shows a customer a raw `passwordTooShort`.
 */

const GOOD_SIGN_UP = {
  name: 'أحمد علي',
  email: 'ahmed@example.com',
  phone: '07701234567',
  password: 'correct horse',
  confirmPassword: 'correct horse',
};

describe('validateSignIn', () => {
  it('normalises the address it hands on', () => {
    const result = validateSignIn({ email: '  Ahmed@Example.COM ', password: 'x' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.values.email).toBe('ahmed@example.com');
  });

  it('trims before judging, which the Zod chain did not', () => {
    // `z.email().trim()` validated first and trimmed after, so an address an
    // autofill had padded was rejected as malformed — which reads to the
    // customer as the store not recognising their own email.
    expect(validateSignIn({ email: ' a@b.co ', password: 'x' }).ok).toBe(true);
  });

  it('asks only that a password was typed', () => {
    // Never a length rule here: "too short" on a sign-in form tells an
    // attacker the policy, and the server decides whether it is right anyway.
    expect(validateSignIn({ email: 'a@b.co', password: 'a' }).ok).toBe(true);
    expect(validateSignIn({ email: 'a@b.co', password: '' }).errors).toEqual({
      password: 'required',
    });
  });

  it.each([
    '',
    'no-at-sign',
    '@nothing.before',
    'nothing.after@',
    'two@@at.co',
    'a b@c.co',
    'a@nodot',
  ])('refuses %j as an address', (email) => {
    expect(validateSignIn({ email, password: 'x' }).errors['email']).toBe(
      'invalidEmail',
    );
  });
});

describe('validateSignUp', () => {
  it('accepts a complete form and normalises the phone to E.164', () => {
    const result = validateSignUp(GOOD_SIGN_UP);
    expect(result.ok).toBe(true);
    expect(result.ok && result.values.phone).toBe('+9647701234567');
  });

  it('treats an empty phone as not given, not as invalid', () => {
    // The same blank-is-undefined trap the env schema paid for: an optional
    // field left alone must not become an error.
    const result = validateSignUp({ ...GOOD_SIGN_UP, phone: '   ' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.values.phone).toBeNull();
  });

  it('refuses a phone that is not Iraqi', () => {
    expect(
      validateSignUp({ ...GOOD_SIGN_UP, phone: '0501234567' }).errors['phone'],
    ).toBe('invalidPhone');
  });

  it('enforces the eight-character minimum', () => {
    const short = { ...GOOD_SIGN_UP, password: 'short', confirmPassword: 'short' };
    expect(validateSignUp(short).errors['password']).toBe('passwordTooShort');
  });

  it('reports a mismatch against the confirmation field, not the password', () => {
    const result = validateSignUp({
      ...GOOD_SIGN_UP,
      confirmPassword: 'something else',
    });
    expect(result.errors).toEqual({ confirmPassword: 'passwordMismatch' });
  });

  it('requires a name of at least three characters', () => {
    expect(validateSignUp({ ...GOOD_SIGN_UP, name: 'ab' }).errors['name']).toBe(
      'required',
    );
    expect(
      validateSignUp({ ...GOOD_SIGN_UP, name: 'a'.repeat(121) }).errors['name'],
    ).toBe('tooLong');
  });

  it('collects every failure at once', () => {
    // One field at a time makes a customer submit five times to find out.
    const result = validateSignUp({
      name: '',
      email: 'nope',
      phone: '123',
      password: 'abc',
      confirmPassword: 'xyz',
    });
    expect(Object.keys(result.errors).sort()).toEqual([
      'confirmPassword',
      'email',
      'name',
      'password',
      'phone',
    ]);
  });
});

describe('validateForgotPassword and validateResetPassword', () => {
  it('checks the address', () => {
    expect(validateForgotPassword({ email: 'a@b.co' }).ok).toBe(true);
    expect(validateForgotPassword({ email: 'a' }).errors['email']).toBe('invalidEmail');
  });

  it('needs a token, a long enough password, and a matching confirmation', () => {
    const good = {
      token: 't',
      password: 'long enough',
      confirmPassword: 'long enough',
    };
    expect(validateResetPassword(good).ok).toBe(true);
    expect(validateResetPassword({ ...good, token: ' ' }).errors['token']).toBe(
      'required',
    );
    expect(
      validateResetPassword({ ...good, password: 'short', confirmPassword: 'short' })
        .errors['password'],
    ).toBe('passwordTooShort');
    expect(validateResetPassword({ ...good, confirmPassword: 'other' }).errors).toEqual(
      {
        confirmPassword: 'passwordMismatch',
      },
    );
  });
});
