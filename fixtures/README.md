# Benchmark fixtures

Test document set for the extraction benchmark (see `.scratch/vink-v1/issues/03-test-document-set.md`).

Real Documents contain personal data, so `inbox/` and `documents/` are git-ignored. Form definitions, this README and the synthetic Documents (`documents/synthetic-*`, invented names) are committed.

## Layout

```
fixtures/
  inbox/                        # drop PDFs + ground-truth CSV here (scp/rsync)
  forms/<form>.json             # Form definition
  documents/<form>-NNN/
    document.pdf                # or document.jpg|jpeg|png|heic, or document.eml
    attachments/                # an email's PDF/image attachments, optional
    expected.json               # ground truth
```

The harness picks the Reader's input by the file: `document.pdf` is a PDF (its `pages` in `expected.json` is the page count), an image file is an image, and `document.eml` is an email. The `.eml` is plain text: `Subject`, `From` and `Date` headers, a blank line, then the body as UTF-8 (no multipart or encoded mails; use `attachments/`). For an image or an email, `pages` is 1.

## Form definition — `forms/<form>.json`

Field model: see `.scratch/vink-v1/issues/04-field-model.md`. These definitions still lack labels, required flags and `choice` options. `list` is a repeating group with its own sub-Fields.

```json
{
  "name": "tire-report",
  "fields": [
    { "name": "licensePlate", "type": "string", "description": "Dutch licence plate, e.g. 12-ABC-3" },
    { "name": "treadDepthFrontLeftMm", "type": "number", "description": "Tread depth front left, in mm" }
  ]
}
```

## Ground truth — `documents/<form>-NNN/expected.json`

```json
{
  "form": "tire-report",
  "source": "original-filename.pdf",
  "category": "digital | scan | handwritten",
  "pages": 1,
  "fieldValues": { "licensePlate": "12-ABC-3", "treadDepthFrontLeftMm": 6.5 }
}
```

A Field that is absent or unreadable on the Document gets `null`.

Ground truth is not written up front. The benchmark run produces Field Values; the user corrects them against the PDF (as in Needs Review), and the corrected values become `expected.json`. Never commit model output as ground truth unchecked.

## Current set (2026-09-23)

| Document | Form | Pages | Kind |
|---|---|---|---|
| tire-service-001 | tire-service | 3 | scan: SE work order + handwritten tyre report |
| tire-service-002 | tire-service | 3 | scan: BE invoice + two handwritten tyre forms |
| tire-service-003 | tire-service | 1 | digital: BE reservation |
| tire-service-004 | tire-service | 3 | digital: BE invoice + T&C page + email page |
| invoice-001 | invoice | 1 | digital: NL invoice |

`expected.json` now exists for every Document (2026-09-23, from the benchmark in ticket 07). It lists `verified` paths (confirmed or corrected by the user), `unverified` paths (model output the user accepted without checking) and `unknown` paths (the user couldn't judge; left out of scoring). Scripts are on branch `prototype/extraction-benchmark`.

Synthetic Documents (2026-10-08, ADR 0010 step 4), true by construction:

| Document | Form | Kind |
|---|---|---|
| synthetic-complaint-email-001 | complaint | email: a Dutch complaint about a bread slicer, plain text |
| synthetic-workorder-photo-001 | work-order | image: photo of a handwritten work order (werkbon), with a materials List |

The photo was drawn on the box: an SVG with jittered italic type for the handwriting, then laid crooked on a desk with shading and noise (sharp, one-off; nothing of it is in the repo). The PDF invoice case is `invoice-001`.

Five Documents is a starter set for a qualitative first benchmark; confidence calibration needs 30–50.

## Eval harness (ticket 26)

`npm run eval` runs the real pipeline on every Document here and scores it against `expected.json`. It needs `GOOGLE_VERTEX_CREDENTIALS` and `TYPESAFE_API_KEY`, for example in `.env.eval`. It also writes each Document's model answers to `recording.json`, which the Seam 1 fakes (`convex/test.setup.ts`) can replay. See `scripts/eval/run.ts`.
