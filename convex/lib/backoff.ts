// When a failed Delivery attempt is tried again (spec, Payload and Delivery):
// about 1m, 5m, 30m, 2h and 6h, roughly 8h in all, plus up to 10% jitter so
// many Deliveries to one receiver don't all come back at once.

const MINUTE = 60_000;
const STEPS = [MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 360 * MINUTE];

/** Attempts per series: the first and one per step. */
export const MAX_ATTEMPTS = STEPS.length + 1;

// A receiver asking for more than a day is waited for a day at most.
const RETRY_AFTER_MAX = 24 * 60 * MINUTE;

/** `Retry-After` as milliseconds from `now`: seconds, or an HTTP date. */
function retryAfterMs(header: string | null, now: number) {
  if (header === null) return 0;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), RETRY_AFTER_MAX) : 0;
}

/**
 * When to try again after the `attempt`-th failed attempt of a series (1-based),
 * or `null` when the series is over.
 */
export function nextAttemptAt(attempt: number, retryAfter: string | null, now: number) {
  const step = STEPS[attempt - 1];
  if (step === undefined) return null;
  const backoff = step * (1 + Math.random() * 0.1);
  return now + Math.max(backoff, retryAfterMs(retryAfter, now));
}
