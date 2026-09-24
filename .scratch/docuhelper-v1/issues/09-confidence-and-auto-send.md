# Confidence semantics and auto-send rules

Type: grilling
Status: resolved
Blocked by: 02, 07

## Question

What does a confidence of 0.9 actually mean, and where does it come from (Jev probability, model self-report, agreement between methods)? Is it calibrated? Exact Auto-Send Threshold rule: all Fields vs required Fields only, how repeating groups count, and what happens with empty optional Fields. Candidate signals: Jev yes/no checks per Field, Mistral word-level OCR confidence, and agreement between models. No LLM vendor documents a reliable confidence score of its own.

## Comments

**2026-09-23 (from Benchmark extraction pipelines):** Self-reported confidence ranked right above wrong values (mean 0.90 against 0.70 for Opus), and the models flagged the doubtful values themselves. However, a missed List entry came with a completeness confidence of 0.80–0.85. Self-reported completeness is not trustworthy on bundles, so the Auto-Send rule needs an independent completeness signal.

**2026-09-23 (from Extraction pipeline design):** Confidence now has three inputs:
- the vision model's self-reported confidence per Field Value and per List Field;
- Jev Nouls per filled Field Value: one on fit and plausibility, and one on support by the source text, only for pages with a text layer;
- code checks: type, required, and the page-inventory completeness check, which caps List completeness when it fails.

Decide how these combine into one Field Value confidence. Fixed already: a Document without a Jev result (Jev down) is never auto-approved. Still open: whether Auto-Send is allowed at all when an Admin has switched Jev off for the Organisation.

**2026-09-24 (from API pipeline benchmark):** ADR 0003 changes the inputs. Confidence is now the lowest of Jev's Match probability, Jev fit and Jev support; the vision model's self-report is gone. A source marked `_unsure` or conflicting in the Reading makes the value Needs Review directly. The raw signals stored for calibration become Match probability, fit and support. The minimum rule, the 0.8 default and the Auto-Send rules stand.

## Answer

Settled with the user on 2026-09-23. `CONTEXT.md` now defines **Confidence**, **Review Threshold** and **Auto-Send**. **Auto-Send** replaces the earlier Auto-Send Threshold, and **Needs Review** and **Approval** are sharpened.

- **Meaning:** in v1, confidence is a **ranking score**, not a calibrated probability. 0.9 means "more likely right than 0.8", not "90% chance". The spec says so, and the UI never presents it as a chance. Calibration waits for the larger test set.
- **Combination:** a Field Value's confidence is the **minimum of the available signals**: the model's self-report, the Jev fit/plausibility Noul and the Jev source-support Noul (the last only on pages with a text layer). Review shows which signal was lowest. A List Field's completeness confidence is the model's self-report.
- **Code checks are flags, not numbers:** a type mismatch, a missing required value or a failed page-inventory check makes the value or List Field Needs Review directly, whatever its confidence.
- **Thresholds:** each Form has one **Review Threshold** (default 0.8) and an **Auto-Send** switch (default off). There is no separate Auto-Send number: Auto-Send approves exactly when nothing is Needs Review. The threshold and the switch are Form settings, not part of the Form Version. A change applies to Extractions that finish afterwards, and existing Documents are not re-evaluated.
- **What counts:** every Field Value counts: each top-level Field, each sub-Field of each entry, and each List Field's completeness. An empty optional Field counts with the model's self-reported confidence that the value is really absent, since Jev only checks filled values.
- **Values without a text layer** (scans, handwriting) may be auto-sent. The minimum is taken over the two signals they have.
- **Jev:**
  - With Jev switched off for the Organisation, Auto-Send is unavailable. The switch is shown disabled, with the reason.
  - A partial Jev failure counts as no Jev result for the whole Document, so there is no Auto-Send. Needs Review then falls back to the self-report.
- **When Auto-Send is evaluated:** once, right after an Extraction succeeds (a successful manual retry after Extraction Failed counts), and only if no user has corrected anything on the Document yet. With no Integration attached, the Document is approved and nothing is sent.
- **Kept for calibration:** each Field Value stores its raw signals (self-report, Jev fit, Jev support) next to the combined confidence, plus whether a user corrected it in review. These stay internal and never go in the Payload.

No ADR was written. The minimum rule and the defaults are cheap to change later.
