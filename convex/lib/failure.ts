/**
 * Why an Extraction or a Form Proposal failed, as a code the screens turn
 * into a friendly message in the user's language. The technical error (a stack
 * trace, a missing credential) goes to the logs only and is never stored.
 *
 * - `unreadable`: the input itself can't be read and never will be (a retry
 *   does not help).
 * - `failed`: every attempt failed; usually a passing fault, so Retry may work.
 *
 * Rows from before the codes hold the raw error as free text; they all show as
 * `failed`.
 */
export type FailureCode = "unreadable" | "failed";

/** The code to store for a failure. */
export function failureCodeOf(unreadable: boolean): FailureCode {
  return unreadable ? "unreadable" : "failed";
}

/** The code a stored value stands for; `null` when nothing failed. */
export function failureOf(stored: string | null | undefined): FailureCode | null {
  if (stored === undefined || stored === null || stored === "") return null;
  return stored === "unreadable" ? "unreadable" : "failed";
}
