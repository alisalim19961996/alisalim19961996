/**
 * A fixed-window counter, as a pure function.
 *
 * The state is passed in and handed back rather than held here, so the policy
 * can be unit-tested against a clock the test controls — a limiter verified by
 * waiting is a limiter nobody re-verifies after changing it.
 */

export interface WindowState {
  count: number;
  /** Epoch milliseconds at which this window ends and the count starts again. */
  resetAt: number;
}

export interface WindowDecision {
  state: WindowState;
  allowed: boolean;
  /** Milliseconds until the caller may try again; 0 while they are allowed. */
  retryAfterMs: number;
}

export function hitWindow(
  previous: WindowState | undefined,
  options: { now: number; windowMs: number; max: number },
): WindowDecision {
  const { now, windowMs, max } = options;

  // A window that has run out is not extended, it is replaced. Extending it on
  // every attempt is how a fixed window quietly becomes a permanent ban for
  // someone who keeps trying.
  const state =
    previous && previous.resetAt > now
      ? { count: previous.count + 1, resetAt: previous.resetAt }
      : { count: 1, resetAt: now + windowMs };

  const allowed = state.count <= max;

  return {
    state,
    allowed,
    retryAfterMs: allowed ? 0 : state.resetAt - now,
  };
}

/**
 * Drop windows that have expired.
 *
 * Without this the map is an unbounded memory leak keyed by whatever the
 * caller sends — which, for a public form, is whatever anyone sends.
 */
export function pruneWindows(
  windows: Map<string, WindowState>,
  now: number,
): Map<string, WindowState> {
  for (const [key, state] of windows) {
    if (state.resetAt <= now) windows.delete(key);
  }
  return windows;
}
