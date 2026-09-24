# 29 — Extraction failures and retry

Type: task
Status: resolved
Blocked by: 27

## What to build

Workpool retries Read, Match and Fill failures 3 times with backoff. After that the Document is `extraction_failed`, shown in the Failed tab and on the review screen with a Retry button. A manual retry resumes at Match when a Reading is stored, so the PDF isn't read (and paid for) twice. A new run never overwrites a user's corrections. If Verify fails, the Extraction still succeeds, but the Document isn't Jev-verified.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for error and retry states for background jobs. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] A scripted Read, Match or Fill failure is retried 3 times, then the Document is Extraction Failed
- [x] Retry resumes at Match when a Reading exists, and runs a full Extraction when none does
- [x] A Verify failure leads to `needs_review` without the Jev-verified flag, and confidence falls back to the Match probability
- [x] Corrections survive any re-run
- [x] The Failed tab and the Extraction Failed state with Retry appear on the list and the review screen
- [x] `convex-test` covers every path above with scripted failures

## Comments

- 2026-09-24 — Built on branch `ticket-29-failures` (stacked on `ticket-28-review-lists`). Each Extraction is queued with a Workpool `onComplete` (`extraction.completed`). When all 4 attempts fail (the first and 3 retries, with 10 s / 30 s / 90 s backoff) and the Document is still `extracting`, it moves to `extraction_failed`, keeps the last error in `documents.extractionError` and logs "extraction_failed". `extraction.retry` (Member or Admin, only from `extraction_failed`) moves it back to `extracting`, logs "extraction_retried" and queues the run again. The run already skips Read when a Reading is stored. `extraction.finish` ignores a run that arrives when the Document is no longer `extracting`, so a late or duplicate run never overwrites corrections. A Verify failure still ends in `needs_review` without the Jev-verified flag (ticket 24).
- UI: the review screen shows a red Alert ("DocuHelper couldn't read this Document", that it tried four times, the raw error in small mono text) with a Retry button. The Failed tab of the Document list has a Retry button per row. Mobbin references: [Dropbox Dash "Couldn't connect"](https://mobbin.com/screens/f10e8de9-fc45-47d7-8ada-238f1ea8d062) (a plain-language title and one "Try again") and [fal's error result](https://mobbin.com/screens/1f39059b-e27c-4973-aacf-5fe18aeca376) (the technical error kept secondary).
- Tests: `convex/failures.test.ts` covers Read, Match and Fill each failing 4 times into Extraction Failed (with the history and the Failed tab count), an outage that heals within the retries, a retry resuming at Match without Read, a retry with no Reading running in full, the retry rules and tenancy, and a late run leaving a correction alone. The fake pipeline gained `failTimes(step, n)`.
