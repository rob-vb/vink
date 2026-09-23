# DocuHelper v1 — map

Label: wayfinder:map

## Destination

A build-ready spec at `docs/spec.md` (plus ADRs for hard calls) for v1: a user creates a Form, uploads a PDF (incl. handwritten), a pipeline fills every Field with a confidence-scored Field Value, low-confidence values are Needs Review, and after Approval (manual, or automatic via the Form's Auto-Send Threshold) the Payload is POSTed as JSON to an Integration. When no tickets remain, write the spec with `/to-spec`.

## Notes

- Domain: multi-tenant SaaS for document data extraction. Vocabulary in `CONTEXT.md` — use its terms (Form, Field, Document, Field Value, Needs Review, Approval, Auto-Send Threshold, Payload, Integration).
- We talk Dutch; the app, code and all terms are English.
- Grilling tickets: call the Skill tool for `grilling` and `domain-modeling`. Research tickets: `research`. Anything involving Jev/TypeSafe: also consult the `typesafe:typesafe-ai` skill.
- Cost-efficiency is a first-class criterion for the extraction pipeline; handwriting support is highly desired.
- Settled while charting: intake is upload-only; Form is chosen by the user at upload; Payload is keyed by the Form's own Fields (no mapping to target fields); Auto-Send Threshold is set per Form (0–1, unset = always manual); stack leans TypeScript.
- Reference use case: tire reports (tyre swaps etc.) — the user built a similar tool before.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md) — gist -->

- [TypeSafe/Jev capabilities and fit](issues/02-typesafe-jev-capabilities.md) — Jev is text-only and never writes values. Use it for per-Field checks, confidence, escalation and Form selection, not for extraction or handwriting. It is cheap, but in early access and US-hosted.

## Not yet specified

- Automatic Document-type detection (choosing the Form for the user) — likely a Jev judgment once the pipeline is known.
- Learning from user corrections in Needs Review to improve future extractions.
- PDFs that bundle several Documents (splitting) and very long/multi-page Documents.
- Billing and pricing model (per page?) — depends on the cost picture from the pipeline benchmark.

## Out of scope

- Developer agent that builds Integrations from API docs — later version.
- Pre-built Integrations for specific systems (Exact, AFAS, …) — later version.
- Mapping Form Fields onto an external system's target fields — v1 sends the Form's own JSON.
- Intake via inbound email, mailbox connection or API — v1 is upload-only.
