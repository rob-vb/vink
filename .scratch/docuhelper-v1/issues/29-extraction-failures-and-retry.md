# 29 — Extraction failures and retry

Type: task
Status: ready-for-agent
Blocked by: 27

## What to build

Workpool retries Read, Match and Fill failures 3 times with backoff. After that the Document is `extraction_failed`, shown in the Failed tab and on the review screen with a Retry button. A manual retry resumes at Match when a Reading is stored, so the PDF isn't read (and paid for) twice. A new run never overwrites a user's corrections. If Verify fails, the Extraction still succeeds, but the Document isn't Jev-verified.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for error and retry states for background jobs. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] A scripted Read, Match or Fill failure is retried 3 times, then the Document is Extraction Failed
- [ ] Retry resumes at Match when a Reading exists, and runs a full Extraction when none does
- [ ] A Verify failure leads to `needs_review` without the Jev-verified flag, and confidence falls back to the Match probability
- [ ] Corrections survive any re-run
- [ ] The Failed tab and the Extraction Failed state with Retry appear on the list and the review screen
- [ ] `convex-test` covers every path above with scripted failures
