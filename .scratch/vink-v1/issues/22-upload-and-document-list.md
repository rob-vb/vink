# 22 — Upload a PDF and see it in the Document list

Type: task
Status: resolved
Blocked by: 20

## What to build

A Member uploads a PDF and chooses the Form it belongs to. The PDF is stored in Cloudflare R2 with EU jurisdiction via `@convex-dev/r2`. The **Document** records the current Form Version, filename, page count, uploader and upload time, and is created as `extracting`. Uploads over 20 pages are refused with a clear message. The Document list has tabs by state with counts (Extracting, Needs Review, Approved, Failed), and status updates arrive live through Convex subscriptions without a refresh. The PDF can be viewed only through a short-lived signed URL, issued after a Membership check. The Extraction itself comes in ticket 23. Until then a Document just sits in Extracting.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for upload (with the Form picker) and the Document list with its state tabs. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] A Member can upload a PDF against a Form. The Document records the Form Version current at upload time and starts as `extracting`
- [x] A PDF over 20 pages is refused with a clear message, and nothing is stored
- [x] The Document list shows tabs by state with counts that update live
- [x] The PDF opens through a short-lived signed URL, and a user without a Membership in that Organisation gets no URL
- [x] History records "uploaded" with who and when
- [x] `convex-test` with a faked R2 covers the page cap, the tenancy check on signed URLs and the initial state

## Comments

- 2026-09-24 — Built on branch `ticket-22-upload-documents`. Upload takes two steps. `documents.generateUploadUrl` (orgMutation) issues an R2 key prefixed with the Organisation id, and the browser PUTs the PDF there. Then `documents.create` (the first `orgAction`) checks the key's prefix, reads the PDF, counts its pages with `pdf-lib` and inserts the Document as `extracting` on the Form's current version. Every refusal deletes the R2 object: over 20 pages, not a readable PDF, or a Form from another Organisation. `documents.pdfUrl` is a mutation, so a cached result never hands out an expired URL. It returns a 5-minute signed URL after the Membership check. Tab counts come from a `documentCounts` table (per Organisation per state), so every later state change must update it. The history lives in `documentEvents` with an explicit `at` (convex-test's `_creationTime` ignores fake clocks). R2 sits behind `convex/lib/pdfStore.ts`, and tests swap in `fakePdfStore` from `test.setup.ts` with `vi.mock`. Tests: 12 at Seam 1 in `convex/documents.test.ts`.
- UI: the Organisation home is now the Document list (a Documents nav link for everyone), with line tabs and count badges, a table (the filename opens the PDF in a new tab), and an Upload dialog with a Form picker and a drop zone. Checked in headless Chrome against dev: dialog, empty tabs, a Document inserted from the CLI appearing live without a refresh, and phone width with no horizontal scroll.
- **Open:** dev and prod have no R2 bucket yet, so a real upload fails with "We couldn't upload the PDF" (`R2 configuration is missing`). To do: create an EU-jurisdiction bucket, add a CORS rule that allows `PUT` from the app origins with a `Content-Type` header, and set `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` on both deployments. Then check an upload and opening the PDF end to end.
- Mobbin references used:
  - Upload dialog with a drop zone and a size limit line: [Mistral AI](https://mobbin.com/screens/a5bb0993-1f68-42ff-a51a-68f7c360681a), [Lindy](https://mobbin.com/screens/3e300add-51ee-481a-8a85-bff87d284f64), [Contractbook](https://mobbin.com/screens/9ade8914-50df-486d-b7c9-a57829694ac4) (per-upload metadata next to the file)
  - State tabs with counts above a table: [Xero](https://mobbin.com/screens/ca1a93b0-0b94-4baf-8bc5-614e598f16cc), [Mistral AI](https://mobbin.com/screens/003684d5-a229-4cff-a2a4-25dcbe87ad32), [PandaDoc](https://mobbin.com/screens/007f69e0-0bc9-40e6-90a6-3462847e7c9c)
