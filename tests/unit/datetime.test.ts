import { describe, expect, it } from 'vitest';
import { dateFormatter, dateTimeFormatter } from '@/lib/datetime';

/**
 * Seven admin screens formatted dates, and three of them did it differently —
 * no timezone and no digit system. Both differences are invisible on a machine
 * already set to Baghdad, which is how they survived review.
 *
 * The instant below is 2026-03-05 22:30 UTC, which is 01:30 on the SIXTH in
 * Baghdad. A formatter without a timezone prints the fifth on a UTC server,
 * so an order placed just after midnight is filed under the previous day.
 */
const AFTER_MIDNIGHT_IN_BAGHDAD = new Date('2026-03-05T22:30:00Z');

describe('dates are printed in Baghdad', () => {
  it('rolls over to the next day for an instant past midnight there', () => {
    expect(dateFormatter('en').format(AFTER_MIDNIGHT_IN_BAGHDAD)).toContain('06');
  });

  it('prints the hour in Baghdad, not the server, for a timed format', () => {
    expect(dateTimeFormatter('en').format(AFTER_MIDNIGHT_IN_BAGHDAD)).toContain(
      '01:30',
    );
  });
});

describe('dates are printed in Latin digits in both languages', () => {
  it('uses Latin digits in Arabic', () => {
    const arabic = dateFormatter('ar', 'medium').format(AFTER_MIDNIGHT_IN_BAGHDAD);
    expect(arabic).toMatch(/\d/);
    // The Arabic-Indic block. Its presence is the bug this rules out.
    expect(arabic).not.toMatch(/[٠-٩]/);
  });

  it('uses Latin digits in English too', () => {
    expect(dateFormatter('en', 'medium').format(AFTER_MIDNIGHT_IN_BAGHDAD)).toMatch(
      /\d/,
    );
  });
});
