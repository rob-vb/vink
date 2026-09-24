# Benchmark fixtures

Test document set for the extraction benchmark (see `.scratch/docuhelper-v1/issues/03-test-document-set.md`).

Real Documents contain personal data, so `inbox/` and `documents/` are git-ignored. Only Form definitions and this README are committed.

## Layout

```
fixtures/
  inbox/                        # drop PDFs + ground-truth CSV here (scp/rsync)
  forms/<form>.json             # Form definition
  documents/<form>-NNN/
    document.pdf
    expected.json               # ground truth
```

## Form definition — `forms/<form>.json`

Field model: see `.scratch/docuhelper-v1/issues/04-field-model.md`. These definitions still lack labels, required flags and `choice` options. `list` is a repeating group with its own sub-Fields.

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

Five Documents is a starter set for a qualitative first benchmark; confidence calibration needs 30–50.
