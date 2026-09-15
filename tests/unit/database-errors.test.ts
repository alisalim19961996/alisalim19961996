import { describe, expect, it } from 'vitest';
import {
  DatabaseSetupError,
  diagnoseDatabaseError,
  uniqueConstraintName,
} from '@/server/db/diagnose';

/**
 * These matter because the failure they prevent is expensive in a very ordinary
 * way: the owner restarts their PC, PostgreSQL does not come back up, and the
 * homepage answers with a stack trace pointing at `product.findMany()` — a
 * message about the one thing that is not wrong.
 */

const prismaError = (code: string) =>
  Object.assign(new Error('raw prisma noise'), {
    code,
    name: 'PrismaClientKnownRequestError',
  });

describe('diagnoseDatabaseError', () => {
  it.each([
    ['P1000', 'username or password'],
    ['P1001', 'not reachable'],
    ['P1002', 'timed out'],
    ['P1003', 'does not exist'],
    ['P1017', 'closed the connection'],
    ['P2021', 'table is missing'],
    ['P2022', 'column is missing'],
  ])('explains %s in terms of what to do', (code, expected) => {
    const result = diagnoseDatabaseError(prismaError(code));

    expect(result).toBeInstanceOf(DatabaseSetupError);
    const error = result as DatabaseSetupError;
    expect(error.code).toBe(code);
    expect(error.message).toContain(expected);
    // Every diagnosis must name a fix, not just a cause.
    expect(error.message).toContain('How to fix it:');
  });

  it('keeps the original error as the cause', () => {
    // The raw error still has to reach the server log; only what a human reads
    // first is replaced.
    const original = prismaError('P1001');
    const result = diagnoseDatabaseError(original) as DatabaseSetupError;
    expect(result.cause).toBe(original);
  });

  it('passes an ordinary query error through as the SAME object', () => {
    // Services identify ordinary failures by `instanceof` and `code` — a
    // wrapper around every error would break that silently, so this asserts
    // the identity holds rather than merely the message.
    const unique = prismaError('P2002');
    expect(diagnoseDatabaseError(unique)).toBe(unique);

    const missingRow = prismaError('P2025');
    expect(diagnoseDatabaseError(missingRow)).toBe(missingRow);
  });

  it('leaves anything that is not a coded error alone', () => {
    const plain = new TypeError('boom');
    expect(diagnoseDatabaseError(plain)).toBe(plain);

    expect(diagnoseDatabaseError(null)).toBeNull();
    expect(diagnoseDatabaseError(undefined)).toBeUndefined();
    expect(diagnoseDatabaseError('a string')).toBe('a string');
  });

  it('ignores a non-string code', () => {
    const odd = Object.assign(new Error('x'), { code: 1001 });
    expect(diagnoseDatabaseError(odd)).toBe(odd);
  });
});

describe('uniqueConstraintName', () => {
  /**
   * Both shapes matter, and only one of them is what this project actually
   * sees: Prisma's classic engine fills `meta.target`, while the pg driver
   * adapter used here leaves it undefined and reports the constraint under
   * `meta.driverAdapterError`. A reader that only knows `target` passes every
   * unit test and then fails against the real database — which is exactly how
   * "this SKU is taken" became "something went wrong".
   */
  const p2002 = (meta: unknown) =>
    Object.assign(new Error('unique'), {
      code: 'P2002',
      name: 'PrismaClientKnownRequestError',
      meta,
    });

  it('reads the classic engine shape', () => {
    expect(uniqueConstraintName(p2002({ target: ['slugEn'] }))).toBe('slugEn');
    expect(uniqueConstraintName(p2002({ target: 'sku' }))).toBe('sku');
  });

  it('reads the pg driver adapter shape', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { index: 'product_variant_sku_key' },
        },
      },
    };
    expect(uniqueConstraintName(p2002(meta))).toBe('product_variant_sku_key');
  });

  it('reads a column list from the adapter too', () => {
    const meta = {
      driverAdapterError: { cause: { constraint: { fields: ['slugAr', 'slugEn'] } } },
    };
    expect(uniqueConstraintName(p2002(meta))).toBe('slugAr,slugEn');
  });

  it('is null for anything that is not a unique violation', () => {
    expect(uniqueConstraintName(prismaError('P2025'))).toBeNull();
    expect(uniqueConstraintName(new Error('boom'))).toBeNull();
    expect(uniqueConstraintName(null)).toBeNull();
  });

  it('is null when P2002 carries no usable constraint', () => {
    expect(uniqueConstraintName(p2002(undefined))).toBeNull();
    expect(uniqueConstraintName(p2002({}))).toBeNull();
  });
});
