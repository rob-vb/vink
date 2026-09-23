# Extraction pipeline design

Type: grilling
Status: open
Blocked by: 07

## Question

Given the benchmark, which pipeline do we build: triage step (text layer vs scanned vs handwritten), extraction method per branch, how Field Values are assigned (LLM, Jev, or both), and fallbacks. Record as an ADR. Also decide whether US-hosted Jev is acceptable under GDPR for our tenants: its data processing agreement has EU standard contractual clauses, but TypeSafe keeps a perpetual right to derive logs and statistics from our data, and zero retention is enterprise-only.
