// The cheap defences in front of self-serve sign-up (spec, Sign-up and
// abuse): a disposable-domain block, a honeypot field, and a counter for
// the limits Better Auth can't key itself (magic links per email).
import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

export const DISPOSABLE_EMAIL_MESSAGE =
  "This email address can't be used. Use your work or personal address.";

/** The hidden sign-up field only bots fill in. The contact form uses the same name. */
export const HONEYPOT_FIELD = "website";

let blocklist: Set<string> | null = null;

/**
 * Whether the address is at a disposable-email domain, or a subdomain of
 * one. Free-mail (Gmail, Outlook) is fine, and `+tags` and dots are left alone.
 */
export function isDisposableEmail(email: string) {
  blocklist ??= disposableEmailBlocklistSet();
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (blocklist.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/** Whether a honeypot value means a bot filled in the form. */
export function filledHoneypot(value: unknown) {
  return typeof value === "string" && value.trim() !== "";
}

export type Window = { count: number; start: number };

/**
 * A fixed-window counter: at most `max` in each `windowMs` from the first
 * one. Returns whether this one is allowed, and the window to store.
 */
export function countIn(
  window: Window | null,
  now: number,
  { max, windowMs }: { max: number; windowMs: number },
): { allowed: boolean; window: Window } {
  if (window === null || now - window.start >= windowMs) {
    return { allowed: true, window: { count: 1, start: now } };
  }
  if (window.count >= max) return { allowed: false, window };
  return { allowed: true, window: { count: window.count + 1, start: window.start } };
}
