import { describe, expect, it } from 'vitest';
import { hitWindow, pruneWindows, type WindowState } from '@/lib/domain/rate-limit';

const OPTIONS = { windowMs: 60_000, max: 3 };

describe('hitWindow', () => {
  it('allows up to the limit and then refuses', () => {
    let state: WindowState | undefined;
    const results: boolean[] = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const decision = hitWindow(state, { ...OPTIONS, now: 1_000 });
      state = decision.state;
      results.push(decision.allowed);
    }

    expect(results).toEqual([true, true, true, false, false]);
  });

  it('says how long to wait', () => {
    let state = hitWindow(undefined, { ...OPTIONS, now: 1_000 }).state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = hitWindow(state, { ...OPTIONS, now: 1_000 }).state;
    }

    const decision = hitWindow(state, { ...OPTIONS, now: 20_000 });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBe(41_000);
  });

  it('starts a new window once the old one has passed', () => {
    let state = hitWindow(undefined, { ...OPTIONS, now: 0 }).state;
    state = hitWindow(state, { ...OPTIONS, now: 0 }).state;
    state = hitWindow(state, { ...OPTIONS, now: 0 }).state;
    expect(hitWindow(state, { ...OPTIONS, now: 0 }).allowed).toBe(false);

    const afterwards = hitWindow(state, { ...OPTIONS, now: 60_001 });
    expect(afterwards.allowed).toBe(true);
    expect(afterwards.state.count).toBe(1);
  });

  it('does not extend a live window on a refused attempt', () => {
    // Extending on every attempt turns a one-minute limit into a permanent
    // block for anyone who keeps trying — which is what a worried customer
    // does.
    let state = hitWindow(undefined, { ...OPTIONS, now: 0 }).state;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      state = hitWindow(state, { ...OPTIONS, now: 30_000 }).state;
    }

    expect(state.resetAt).toBe(60_000);
    expect(hitWindow(state, { ...OPTIONS, now: 60_001 }).allowed).toBe(true);
  });
});

describe('pruneWindows', () => {
  it('drops expired windows and keeps live ones', () => {
    const windows = new Map<string, WindowState>([
      ['expired', { count: 9, resetAt: 500 }],
      ['exactly-now', { count: 9, resetAt: 1_000 }],
      ['live', { count: 1, resetAt: 5_000 }],
    ]);

    // Keyed by what a public form is sent, so an unpruned map is an unbounded
    // leak that anyone can fill.
    expect([...pruneWindows(windows, 1_000).keys()]).toEqual(['live']);
  });
});
