import { describe, expect, it } from 'vitest';
import { DatabaseSetupError, diagnoseDatabaseError } from '@/server/db/diagnose';

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
    // server/services/order.ts catches P2002 by `instanceof` and `code` to
    // retry an order number. Wrapping it would break that silently — the
    // retry would stop firing and concurrent checkouts would surface the
    // collision to the customer.
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
