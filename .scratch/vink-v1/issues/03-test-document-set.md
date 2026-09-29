# Test document set with ground truth

Type: task
Status: resolved
Blocked by: 

## Question

Assemble 10–20 real sample PDFs — mostly tire reports, plus at least one handwritten Document and one invoice — each with a Form definition and the correct Field Values (ground truth), so extraction pipelines can be benchmarked. HITL: the user supplies the documents and correct values; the agent structures them under a fixtures folder. The extraction research recommends 30–50 Documents split into digital, clean scan and handwritten. 10–20 is the minimum to start.

## Comments

**2026-09-23 — setup (agent):** Choices made with the user: PDFs arrive via scp/rsync in `fixtures/inbox/`; real Documents stay out of git (`fixtures/.gitignore` ignores `inbox/` and `documents/`); ground truth is filled in by the user, never drafted by a model, because the benchmark uses Claude to read these PDFs. Layout and formats: `fixtures/README.md`. Waiting on the user for: PDFs, Field list per Form, and ground-truth CSV (one row per PDF: `filename, category, <field>…`). The agent then converts them into `documents/<form>-NNN/{document.pdf, expected.json}` and `forms/<form>.json`.

**2026-09-23 — scope change (user + agent):** The user has 5 PDFs, not 10–20, and won't hand-fill ground truth or Field lists per Document. Agreed: 5 is the starter set; the agent proposes Forms; ground truth comes from the user correcting the first benchmark output.

## Answer

Starter set of 5 Documents in `fixtures/documents/` (git-ignored, personal data), described in `fixtures/README.md`:

- **4 × `tire-service`**, all tyre service for one fleet customer from 3 suppliers with different layouts and languages (SE, BE-NL). 2 digital, 2 scans with handwritten tyre reports (tread depths, brands, serials, positions).
- **1 × `invoice`**, the user's own invoice (digital, NL).

Forms were proposed by the agent: `fixtures/forms/tire-service.json` (one Form across all suppliers; includes a repeating `tireChanges` list) and `fixtures/forms/invoice.json`.

**Ground truth has no `expected.json` yet.** It is created in the benchmark: the user corrects the extracted Field Values against the PDF, and those corrections become `expected.json`.

Facts later tickets depend on:
- **3 of the 4 tyre PDFs bundle several Documents** (invoice/work order + handwritten report, or + T&C + email page). The needed data is spread across the parts, e.g. the plate on the invoice and the tread depths on the handwritten sheet. So in practice one PDF = one Document, filled from all of its pages.
- **Real Forms need repeating groups** (several tyres per service), not just flat Fields.
- **5 Documents allows a qualitative benchmark only.** It can't calibrate confidence; that needs 30–50.
