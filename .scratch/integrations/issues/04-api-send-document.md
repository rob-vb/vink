# 04: API: send a Document in

**What to build:** a program sends a PDF to `POST /v1/forms/{form_id}/documents` with an API Key, and it becomes a Document of that Form, exactly as if it had been emailed to the Form's Intake Address: same processing, same Pages counting, same notifications. Because the caller waits for an answer, a refusal is a clear 4xx instead of silence: not a PDF, over 20 pages, not enough Pages, or a Form that isn't the key's Organisation's. A success returns the Document's id and state.

**Blocked by:** 03

**Status:** built on `int/04-api-send-document`; the e2e curl against dev is left for the orchestrator (commands below)

- [x] Upload and Intake Address share one path for accepting a PDF into a Form; the API uses it too
- [x] Refusals: 415 not a PDF, 413/422 over 20 pages, 402 out of Pages, 404 unknown or foreign Form; each with a JSON error body
- [x] The Document shows in the app like any other, with the API Key's name as its source
- [x] OpenAPI document and reference updated
- [ ] Convex tests for each refusal and for Pages counting once; an e2e upload with curl against dev

## Comments

**2026-10-06 (implementer).** What was built:

- One shared path: `acceptPdf(ctx, { organisationId, formId, key, filename, uploadedBy, uploaderEmail })` in `convex/documents.ts`. It runs `checkPdf`, then `internal.documents.insert` (charge Pages + create the Document in one transaction; `insert` now returns the Document id). A refused PDF creates nothing, charges nothing and is removed from storage. App upload (`documents.create`) and the Intake Address (`intake.receive`) now call it. Their error strings did not change. `NOT_A_PDF` and `tooManyPages(n)` are exported, so the API maps the same text.
- `pdfStore.store(ctx, key, bytes)` (`r2.store`), and a `store` on `fakePdfStore`.
- `POST /v1/forms/{form_id}/documents` in `convex/publicApi/documents.ts` (`documentsRoutes`). Order: an internal query checks that the Form belongs to the key's Organisation and reads the key's name; the body is read and checked; the bytes go to R2 under `<organisationId>/<uuid>`; an internal action `accept` runs `acceptPdf` in its own action (so the HTTP action's bytes and pdf-lib's parse do not share one action's memory) and turns refusals into API codes. If that action fails, the PDF is removed.
- Request formats: `multipart/form-data` with the PDF in a part named `file` (Zapier, Make, Power Automate); an optional `filename` part. Or the raw PDF as the body with `Content-Type: application/pdf` or `application/octet-stream`. The `?filename=` query works for both. Filename order: query, `filename` part, the file part's own name, `document.pdf`. Folders in front of the name are dropped. Multipart is parsed by hand, because the Convex runtime promises only `text/json/blob/arrayBuffer` on a request (the docs do not list `formData()`).
- Answers: 201 `{ "id", "state": "processing" }`. Refusals, each with the JSON error body: 400 `missing_file`; 401 (from 03); 402 `out_of_pages` (the Pages message); 404 `not_found` for an unknown, malformed or other Organisation's Form; 413 `file_too_large` (over 20 MiB); 415 `not_a_pdf` (pdf-lib can't read it) and 415 `unsupported_media_type` (neither multipart nor PDF); 422 `too_many_pages`.
- Size: the Convex docs (functions/http-actions) say "Request and response size is limited to 20MB". So the documented cap is 20 MB, and the handler refuses more than 20 MiB with 413 (via `Content-Length` first, then the body length). Next's `proxyClientMaxBodySize` is already 25 MB (ticket 03). nginx allows 32 MB. Note: the Convex runtime has 64 MiB of memory per action, so a PDF near 20 MB is the case to check for real.
- Source in the app: `uploaderEmail` = `API: <key name>` and `uploadedBy` = `api:<apiKeyId>`. The name is copied when the Document is made, so the source is still right after the key is revoked (and the row deleted). "API" reads the same in Dutch and English. No schema change. The Documents table does not change, so the demo does not change.
- OpenAPI: `convex/publicApi/openapi/documents.ts` (tag "Documents", schema `SentDocument`, the six error codes). The reference's curl example now uses `-F "file=@document.pdf"` for a multipart body. The names do not clash with ticket 06's schemas or codes. The 404 message has the same form as 06's.
- "Same notifications": the Intake Address only emails Admins when it is out of Pages. The API caller gets a 402 for that, and no email is sent. Extraction has no notification.

How it was proven:
- `convex/publicApi/documents.test.ts` has 13 tests: a raw PDF body (201, the answer's keys match `SentDocument`, source "API: Zapier"); multipart with the part's filename (folder dropped); a multipart `filename` part; processed to Needs Review with Pages counted once (Free Pages 20 → 17, one object in storage); 415 `not_a_pdf`; 415 `unsupported_media_type`; 400 for no `file` part and for an empty body; 422 at 21 pages; 413 above 20 MiB; 402 that charges nothing; 404 for another Organisation's Form and for a malformed id; 401 for a revoked key; the source after revoke. Each refusal test checks that no Document was made and that no PDF was left in storage.
- The intake, pages and documents tests still pass, unchanged.
- Full suite after merging `integrations`: 51 files, 426 tests passed. `tsc` 0 errors; eslint clean.
- The reference block for this endpoint was rendered with `react-dom/server` as a smoke check.

E2E curl (not run here; for the orchestrator). Dev has no R2, so on dev every call that gets to storage answers 500 `internal_error`: the success, 415 `not_a_pdf`, 422 and 402. Those need prod (or R2 on dev). The others answer before storage:

```sh
BASE=https://<host>/v1                 # or $NEXT_PUBLIC_CONVEX_SITE_URL/v1
KEY=vink_live_...                      # Organisation settings → API Keys
FORM=$(curl -s "$BASE/forms" -H "Authorization: Bearer $KEY" | jq -r '.data[0].id')

# 201 {"id":"…","state":"processing"}: multipart, as the platforms send it
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" -F "file=@werkbon.pdf"
# 201: the raw body, named by the query
curl -i -X POST "$BASE/forms/$FORM/documents?filename=werkbon-2.pdf" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/pdf" --data-binary @werkbon.pdf
# Then in the app: both show under Extracting with "API: <key name>" as the uploader; Pages went down once each.

# 415 not_a_pdf (needs storage)
echo "hello" > not.pdf
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" -F "file=@not.pdf"
# 422 too_many_pages (needs storage): any PDF with 21+ pages
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" -F "file=@21-pages.pdf"
# 402 out_of_pages (needs storage): an Organisation on Free Pages with fewer Pages left than the PDF has

# Answer before storage (also work on dev):
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{}'                                # 415 unsupported_media_type
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" -F "document=@werkbon.pdf"  # 400 missing_file
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/pdf" --data-binary ""                       # 400 missing_file
curl -i -X POST "$BASE/forms/nope/documents" -H "Authorization: Bearer $KEY" -F "file=@werkbon.pdf"      # 404 not_found
# 404 not_found: $FORM with a key of a second Organisation
curl -i -X POST "$BASE/forms/$FORM/documents" -F "file=@werkbon.pdf"         # 401 missing_api_key
head -c 21000000 /dev/urandom > big.bin
curl -i -X POST "$BASE/forms/$FORM/documents" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/pdf" --data-binary @big.bin                 # 413 file_too_large (or Convex's own refusal: check which)
```

Open checks:
- The e2e above. Through the Next rewrite: check that a multipart body arrives whole (25 MB proxy limit) and that a large upload finishes within Next's 30 s `proxyTimeout`.
- What Convex answers to a body above 20 MB (our 413 JSON, or its own error before our code runs). Also check that a real 15–20 MB, 20-page PDF fits the Convex runtime's 64 MiB memory (`checkPdf` with pdf-lib).
- That `request.arrayBuffer()` and the hand-written multipart parser work on the real Convex runtime. The tests run in edge-runtime.
- Real-account checks (the platforms' file fields): Zapier, Make and Power Automate send `file` as multipart. Covered in tickets 07, 10 and 12.
