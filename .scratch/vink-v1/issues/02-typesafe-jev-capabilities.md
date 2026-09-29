# TypeSafe/Jev capabilities and fit

Type: research
Status: resolved
Blocked by: 

## Question

What can TypeSafe's Jev actually do (docs: https://docs.typesafe.ai/introduction.md)? Specifically: inputs it accepts (text only, or images/PDF?), whether it returns calibrated probabilities we can use as a per-Field confidence score, how it would judge 'does this extracted value belong to this Field', pricing, latency, SDK languages, rate limits, data handling/EU terms. Where in a pipeline (triage → extraction → Field assignment → confidence) does it fit, and where does it not?

## Answer

Jev reads text only and never writes values: it chooses from options, scores on a scale, or answers yes/no with a probability. So it can't read PDFs, detect handwriting or extract. It does fit Form selection, checking each Field Value, supplying confidence and deciding which Fields go to a stronger model. TypeSafe's extraction-cascade cookbook is almost exactly our flow: a cheap LLM extracts, Jev runs per-Field checks, and anything above about 0.7 escalates. Probabilities are calibrated across many predictions, not per single answer, so we define our own Field confidence and test it on labelled documents. Cost is about $0.0008 per one-page Document, so OCR and LLM calls dominate. There's a TypeScript SDK. Risks: early access since 2026-09-15, US-hosted, a perpetual right to derive logs and statistics from our data (zero retention only on enterprise), mostly English training, and weak at dates, arithmetic and counting (keep those checks in code).

Findings: branch `research/typesafe-jev-capabilities`, file `.scratch/vink-v1/research/typesafe-jev-capabilities.md`.
Open follow-ups: calibration on Dutch and handwritten documents (goes to Benchmark extraction pipelines), subprocessors list and enterprise zero-retention cost (goes to Extraction pipeline design).
