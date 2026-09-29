# Vink v1 — spec

Status: ready-for-agent

Synthesised from the [Vink v1 map](map.md), its 17 resolved tickets, `CONTEXT.md` and ADRs 0001–0003. Terms in **bold** are from `CONTEXT.md`. Where this spec and a ticket differ, the later ticket wins. This spec already reflects that, so ADR 0002 applies only where ADR 0003 hasn't superseded it.

## Problem Statement

Operations staff at companies such as fleet operators receive paper-heavy documents from suppliers: tyre service reports, work orders, invoices. They are often scanned, often bundled several papers per PDF, and often partly handwritten in Dutch. Someone types the data from each PDF into the company's own system by hand. That is slow, error-prone and boring. Existing OCR tools can't read Dutch handwriting, don't know which number on the page is the mileage and which is the order number, and give no honest sign of which values to double-check. Because nobody knows which values are safe, everything gets checked, so nothing is saved.

## Solution

Vink is a multi-tenant web app. An Admin defines a **Form** once: the **Fields** their system needs, typically proposed automatically from one sample PDF. From then on a Member uploads a PDF against that Form. Vink reads it (handwriting included), fills every Field with a **Field Value** that carries a **Confidence**, the text as read and the page it came from, and flags as **Needs Review** only the values a person should check. The Member checks those values next to the PDF, corrects them where needed and gives **Approval**. The Payload then goes as JSON by HTTP POST to every **Integration** attached to the Form. When the Admin trusts a Form, they turn on **Auto-Send**, and a Document with nothing Needs Review and a full Jev verification is approved and sent with no human involved.

## User Stories

### Account, Organisation and Membership

1. As a new visitor, I want to sign up with email and password or a magic link, so that I can start without talking to sales.
2. As the person who signs up, I want to become Admin of a new **Organisation** automatically, so that I can set things up straight away.
3. As an Admin, I want to invite colleagues by an emailed link with a role of Admin or Member, so that my team can work in the same Organisation.
4. As an invited user, I want to accept an invitation by its link and land in that Organisation, so that joining is one step.
5. As a user with **Memberships** in several Organisations, I want to switch between them, and I want the active one visible in the URL, so that I always know whose data I'm looking at.
6. As an Admin, I want to change a Member's role or remove their Membership, so that access follows people's jobs.
7. As a Member, I want to be kept out of Forms, Integrations, thresholds and user management, so that I can't break the setup by accident.
8. As any user, I want never to see another Organisation's data under any circumstances, so that customer data stays private.

### Forms and Fields

9. As an Admin, I want to create a Form with a name and an optional description, so that I can describe one kind of document.
10. As an Admin, I want to add Fields of type text, number, date, boolean, choice or list, so that I can model what my system needs.
11. As an Admin, I want each Field to have a label in any language, so that my users recognise it.
12. As an Admin, I want each Field's key to be derived from the label and editable, so that the Payload uses names my system expects.
13. As an Admin, I want a key to be locked once any Integration is attached to the Form, so that I can't break a working integration by renaming.
14. As an Admin, I want to give a Field an optional description, with synonyms and other languages, so that extraction finds it on differently worded documents.
15. As an Admin, I want to mark a Field as required, so that a Document missing it is never sent unchecked.
16. As an Admin, I want to define the options of a choice Field, each with a value and an optional description of its synonyms, so that free text on paper maps to my system's codes.
17. As an Admin, I want a **List Field** with sub-Fields, for example one entry per changed tyre or per invoice line, so that repeating data is captured.
18. As an Admin, I want sub-Fields never to be lists themselves, so that the model stays simple.
19. As an Admin, I want every save of a Form to create a new **Form Version**, so that Documents already in progress keep the Fields they were read against.
20. As an Admin, I want to set the Form's **Review Threshold** (0.8 by default), so that I control how cautious review is.
21. As an Admin, I want to switch **Auto-Send** on or off per Form (off by default), so that I automate only the Forms I trust.
22. As an Admin, I want threshold and Auto-Send changes to apply only to Extractions that finish afterwards, so that nothing already reviewed changes under my feet.

### Form Proposal from a sample PDF

23. As an Admin, I want "New Form" to offer "from a sample PDF" or "blank", so that the usual path needs no typing.
24. As an Admin, I want to upload one sample PDF and have Vink propose the Fields, so that I don't have to model the Form by hand.
25. As an Admin, I want to see progress while the sample is read, and to leave and come back, so that I don't have to wait on the page.
26. As an Admin, I want every piece of data in the sample to be listed, with the useful Fields pre-ticked and things like bank details left unticked, so that nothing is dropped silently and I only have to untick.
27. As an Admin, I want proposed labels to use the printed term in the document's language, keys in English camelCase, and descriptions in English with the printed terms as synonyms, so that the Form works for other suppliers too.
28. As an Admin, I want proposed types to follow the content, with choice proposed only when the options are printed on the paper, so that the proposal isn't over-fitted to one filled-in value.
29. As an Admin, I want no proposed Field to be required, so that I decide on purpose what blocks Auto-Send.
30. As an Admin, I want to edit the ticked Fields in the normal Form editor before saving, so that the proposal is only a starting point.
31. As an Admin, I want an option, on by default, to also process the sample as the Form's first Document, so that my first upload isn't wasted.
32. As an Admin, I want the sample's PDF and Reading deleted at once when I turn that option off, so that no data lingers.
33. As an Admin, I want "Suggest Fields from PDF" in the Form editor, which proposes only what the current Form can't place yet, so that a second supplier's layout extends the Form.
34. As an Admin, I want a clear error with retry or "start blank" when a proposal fails, so that I'm never stuck.
35. As an Admin, I want an unsaved Form Proposal to be cleaned up after 7 days with its PDF and Reading, so that abandoned drafts don't keep data.

### Upload and Extraction

36. As a Member, I want to upload a PDF and choose the Form it belongs to, so that it is processed against the right Fields.
37. As a Member, I want uploads over 20 pages to be refused with a clear message, so that I know the limit up front.
38. As a Member, I want a bundled PDF (invoice plus handwritten sheets plus terms) to be treated as one Document, so that facts spread over its papers come together.
39. As a Member, I want handwriting, scans and digital PDFs all to be read, so that I don't have to sort documents first.
40. As a Member, I want to see a Document as Extracting, with a progress state, until its Field Values are ready, so that I know it's being worked on.
41. As a Member, I want to see live status changes without refreshing, so that I can pick up a Document as soon as it's ready.
42. As a Member, I want a Document whose Extraction failed after retries to show Extraction Failed with a manual retry, so that one hiccup doesn't lose the upload.
43. As a Member, I want a retry to resume from the stored **Reading** when there is one, so that the PDF isn't read (and paid for) twice.
44. As a Member, I want a new run never to overwrite my corrections, so that my work is safe.
45. As a Member, I want the same thing written on two papers of a bundle to count once, and conflicting readings to be flagged rather than silently resolved, so that I get one clean record.

### Review

46. As a Member, I want the Document list split into tabs by state, with counts (Needs Review, Approved, Failed, Rejected), and the Documents still being read on their own Extracting page, so that I see my workload at a glance.
47. As a Member, I want the PDF on the left, with page navigation and zoom, and the Form's Fields on the right, so that I can compare value and source side by side.
48. As a Member, I want to filter the Fields to "Needs Review only", so that I only look at what matters.
49. As a Member, I want each row to show the label and key, the editable value, "Read on page N:" with the read text, and a confidence bar with a tick at the threshold plus the number to two decimals, so that I can judge each value quickly.
50. As a Member, I want the confidence never to be shown as a percentage or a chance, so that I'm not misled into reading it as a probability.
51. As a Member, I want every Needs Review value to say why (below threshold, required but empty, doesn't fit the type, read as unsure or conflicting) and which signal was lowest, so that I know what to check.
52. As a Member, I want selecting a row to jump the PDF to its source page, so that I don't have to hunt.
53. As a Member, I want to edit a value (marking it Corrected) or confirm it with "Value is right" (marking it Checked), with Undo, so that I clear Needs Review either way.
54. As a Member, I want each List Field to show a completeness row with its completeness confidence and reason, so that I notice missing or invented entries.
55. As a Member, I want to add an entry, remove an entry and mark "Entries are complete", so that I can repair a List by hand.
56. As a Member, I want Approval blocked while anything is Needs Review, with the button reading "Approve (N left)" and then "Approve and send", so that nothing unchecked is sent.
57. As a Member, I want "Approve and next" to move me to the next Document that needs review, so that I can work through a queue.
58. As a Member, I want to see a marker when Jev did not verify a Document, so that I understand why it can only be approved by hand.
59. As a Member, I want to see the "Does not fit this Form" flag, with Change Form and Reject next to it, so that I catch Documents uploaded against the wrong Form.
60. As a Member, I want a Document history (uploaded, extracted, corrected, Form changed, approved, rejected, reopened, deleted), so that I can see who did what.

### Wrong Form, Reject, Reopen, Delete

61. As a Member, I want Change Form before Approval, including on Extraction Failed, so that a wrong choice at upload is fixed without uploading again.
62. As a Member, I want Change Form to reuse the stored Reading, so that it is quick and cheap.
63. As a Member, I want a warning like "3 corrections will be lost" before Change Form drops my corrections, so that I don't lose work by surprise.
64. As a Member, I want to Reject a blank, unreadable or wrong Document with an optional reason, so that it is never sent.
65. As a Member, I want Rejected Documents hidden behind a filter that is off by default, but still listed with who, when and why, so that the list stays clean but auditable.
66. As a Member, I want to Reopen a Rejected Document while its PDF is still kept, with its values and corrections intact, so that a mistaken Reject can be undone.
67. As an Admin, I want to Delete a Rejected Document outright, for example private data uploaded by mistake, leaving only a "Deleted by X" line, so that I can meet a removal request at once.
68. As a user, I want Change Form, Reject and Delete to be impossible after Approval, so that a sent Document stays done.

### Auto-Send and Approval

69. As an Admin, I want a Document to be approved automatically when Auto-Send is on, nothing is Needs Review, Jev verified it, it doesn't carry "Does not fit this Form", and no user has touched it, so that clean Documents flow through without anyone.
70. As an Admin, I want Auto-Send evaluated once, right after an Extraction succeeds (including a successful manual retry), so that its behaviour is predictable.
71. As an Admin, I want any user action (correction, Change Form, Reopen) to rule out Auto-Send for that Document, so that a human decision is never overridden.
72. As a Member, I want Approval of a Form with no Integration attached to simply mark the Document approved, so that I can use Vink before the integration exists.
73. As an Admin, I want Approval to record whether it was manual or automatic and by whom, so that it can be audited.

### Integrations and Delivery

74. As an Admin, I want to create an Integration with an endpoint URL and free static headers (API key, Bearer, Basic), so that I can reach my system.
75. As an Admin, I want header secrets stored encrypted and masked in the UI, so that credentials don't leak.
76. As an Admin, I want every request signed with HMAC-SHA256 using a secret per Integration, so that my receiver can verify that Vink sent it.
77. As an Admin, I want to attach an Integration to several Forms, and a Form to several Integrations, so that one system can receive several document kinds, and one document kind can go to several systems.
78. As an Admin, I want a test-send with dummy data generated from the Form (marked `"test": true`), or optionally with a processed Document, with the response shown, so that I can check the integration before going live.
79. As a receiver's developer, I want a stable envelope (event, deliveryId, test, document, form, approval, data), so that my endpoint can route and dedupe.
80. As a receiver's developer, I want every key always present, with `null` for no value and `[]` for an empty list, so that my parser needs no special cases.
81. As an Admin, I want failed attempts retried with backoff for about 8 hours, honouring `Retry-After`, so that short outages heal themselves.
82. As an Admin, I want each Delivery to show pending, retrying, delivered or failed, with a log per attempt, on both the Document and the Integration, so that I can diagnose problems.
83. As an Admin, I want an in-app notification when a Delivery fails, so that I don't miss it.
84. As an Admin, I want to re-send a failed Delivery by hand with the same deliveryId, so that I can recover once the receiver is fixed.
85. As an Admin, I want URL and auth fixes to take effect on the next retry, so that I don't have to re-approve Documents.
86. As an Admin, I want detaching or deleting an Integration to fail its open Deliveries with "Integration removed", so that nothing is sent to a system I removed.
87. As an Admin, I want attaching an Integration later not to back-send old Documents, so that nothing floods my system.

### Retention and privacy

88. As an Admin, I want a PDF, with its Reading, Field Values and Payload, deleted 30 days after its last successful Delivery by default, and I want to change that per Organisation, so that we keep data no longer than needed.
89. As an Admin, I want Documents that never get Approval deleted after 90 days, and Rejected Documents' data deleted 30 days after Reject, so that abandoned data doesn't pile up.
90. As an Admin, I want metadata and the Delivery log kept after data deletion, so that the audit trail survives.
91. As a user, I want PDFs to be viewable only through short-lived signed URLs, issued after a Membership check, so that a leaked link expires quickly.

## Implementation Decisions

### Stack and hosting ([ADR 0001](../../docs/adr/0001-convex-cloud-eu-backend.md))

- Next.js (App Router, TypeScript) with shadcn/ui on Tailwind runs on the existing Hetzner VPS in Helsinki under pm2 and nginx. There's no separate worker.
- Convex Cloud EU (`eu-west-1`) is the database, backend functions, job queue (`@convex-dev/workpool`), scheduler and crons. It is deployed with `npx convex deploy`, and CI/CD comes later.
- PDFs are stored in Cloudflare R2 with EU jurisdiction via `@convex-dev/r2`. The reviewer gets short-lived signed URLs after a Membership check.
- Auth is Better Auth via `@convex-dev/better-auth`: email and password plus magic link. Invitation emails go through Resend (EU). There is no SSO or 2FA.
- The subprocessors are Convex, Cloudflare, Google (Vertex AI EU) and Resend in the EU, plus **TypeSafe (Jev)** in the US under SCCs. TypeSafe receives the structured Reading, never the PDF.

### Tenancy and isolation

- One Convex deployment. Every table carries an indexed `organisationId`.
- Every public query, mutation and action goes through a custom wrapper built with `convex-helpers`. The wrapper resolves the caller's Membership for the Organisation in the URL (`/o/<slug>/…`), checks the role (Admin or Member) and injects `organisationId`. A lint rule bans raw `query`, `mutation` and `action` exports.
- There are no per-Form permissions. Admin covers Forms, Integrations, thresholds, retention and users; Member covers upload, review, approve, Change Form and Reject. Delete is Admin-only.

### Data model (entities, not a schema)

- **Organisation**: slug, and retention settings (days after Delivery, default 30).
- **Membership**: user, Organisation, role. **Invitation**: email, role, token, expiry.
- **Form**: name, optional description, Review Threshold (default 0.8), Auto-Send (default off), current Form Version. The threshold and Auto-Send are Form settings, not part of the Form Version.
- **Form Version**: an immutable, numbered list of Fields. A Field has a label, a key, a type (`text | number | date | boolean | choice | list`), an optional description and a required flag. It also has choice options (a value plus an optional description), or, for a list, sub-Fields one level deep. A key is editable until any Integration is attached to the Form.
- **Form Proposal**: the sample PDF, its Reading, the proposed Fields with a ticked flag and status, and the target Form (new, or an existing one for "Suggest Fields from PDF"). It expires after 7 days unsaved.
- **Document**: the Form Version, the R2 object, filename, page count, the uploader and upload time, and a state. It also has the Reading, the Jev-verified flag, the "Does not fit this Form" flag, the "user touched" flag that rules out Auto-Send, the Approval (mode, by, at), rejection info and a history log.
- **Field Value**: one per top-level Field, and one per sub-Field per List entry. It stores the normalised value (or `null`), the read text, the source path in the Reading, the source page(s), a combined Confidence, and the raw signals (Match probability, Jev fit, Jev support). It also stores the Needs Review flag and its reasons, and the review state (untouched, Corrected or Checked, with who and when). A List Field additionally has a completeness confidence and a completeness review state (the "Entries are complete" confirmation).
- **Integration**: name, URL, static headers (secret values encrypted), HMAC secret, and the attached Forms.
- **Delivery**: one per Document per Integration. It holds a stable `deliveryId`, a state (`pending → retrying → delivered | failed`), a failure reason and an attempt log (time, status code, the start of the response body).
- **Notification**: in-app, for failed Deliveries.

### Document lifecycle

States: `extracting → needs_review | approved (auto) → approved`, with the side states `extraction_failed` and `rejected`, and `deleted`, which leaves only metadata. Notes:

- `needs_review` holds whether or not anything is still flagged. Approval is available once nothing is Needs Review.
- Change Form and Reject are allowed from `needs_review` and `extraction_failed`. Change Form sends the Document back to `extracting`. Reject moves it to `rejected`.
- Reopen moves `rejected` back to its prior state and sets "user touched".
- Delete is allowed only from `rejected`, and only for an Admin.
- `approved` is terminal: no Change Form, Reject or re-extraction, and a correction after sending is never re-sent.

### Extraction pipeline ([ADR 0003](../../docs/adr/0003-reading-then-jev-matching.md))

An Extraction is a Node-runtime Convex action run through Workpool with bounded concurrency. It must finish within 10 minutes; uploads are capped at 20 pages and a PDF is never split. It has four steps:

1. **Read:** a vision model on Vertex AI EU receives every page image plus the pdf-inspector text layer (per-page markdown) and writes the **Reading**. The Reading is Form-independent JSON: one object per real-world thing, duplicates across bundled papers merged, conflicting readings kept side by side, and every object carrying `_pages` and `_unsure`. It is stored with the Document, keeps the PDF's retention and never goes in a Payload.
2. **Match:** Jev (TypeSafe, pinned to `jev-1.13.0`) matches the Reading to the Form Version. Each top-level Field is a Choice over the Reading's leaf paths, and each List Field is a Choice over its arrays of objects. Each sub-Field is a Choice over the keys inside the chosen array. Every Choice includes `none`. When a Reading would exceed the 64k-token request cap, it is split into one request for top-level Fields and one for List Fields.
3. **Fill:** a small text model writes each Field Value from the source Match picked, in the form the Field asks for (ISO date, brand written out in full, normalised size). It may only use that source.
4. **Verify:** Jev checks each filled value for fit and plausibility. On pages with a text layer it also checks whether the page text supports the value. All questions for one Document go in one request.

Further decisions:
- **Adapters:** the Reader, Matcher (Jev), Filler and Verifier (Jev) each sit behind a thin provider interface. Which vision model reads and which small model fills are configuration with pinned versions, chosen at build time on Vertex EU. The candidates are Gemini Flash and Claude Sonnet or Opus for the reader, and a Haiku-class model for Fill.
- **Type validation in code:** a value that doesn't fit its type (a number that won't parse, a non-ISO date, a choice outside its options) becomes `null`, keeps its read text and is Needs Review.
- **"Does not fit this Form":** set in code from the Match result when the Reading is empty or fewer than half of the required Fields were matched. The cut-off is configuration.
- **Failures:**
  - Read, Match and Fill failures are retried 3 times by Workpool with backoff; after that the Document is Extraction Failed.
  - A manual retry resumes at Match when a Reading is stored.
  - If Verify fails, the Extraction still succeeds, but the Document is not Jev-verified, so it gets no Auto-Send.
  - Jev is required: there is no fallback matcher and no Organisation switch to turn it off.
- **Re-runs never overwrite user corrections.** Change Form deliberately drops all Field Values and corrections for the old Form and re-runs Match, Fill and Verify on the stored Reading against the new Form's current Form Version. With no Reading stored, it runs a full Extraction.
- The indicative cost is $0.0004–0.0023 per Document for Match and about $0.0003 for Verify, at about 1 s. The reader's cost is measured at build time.

### Confidence and Needs Review

- Confidence is a **ranking score from 0 to 1, not a probability**. The UI never shows it as a percentage.
- A top-level Field Value's confidence is the **minimum** of the signals available: Jev's Match probability, Jev fit and Jev support (support only on text-layer pages). For a sub-Field, the Match probability is the lower of the array choice and the key choice. When Verify failed, it is the Match probability alone. The lowest signal is recorded for display.
- A List Field's completeness confidence is Jev's probability for the array choice.
- A Field Value is **Needs Review** when any of these holds:
  - its confidence is below the Form's Review Threshold;
  - it is required and empty;
  - it failed type validation;
  - its source object lists it in `_unsure`, or the Reading holds a conflicting reading for it.

  A List Field is Needs Review when its completeness confidence is below the threshold. A required List Field with no entries is Needs Review. So is a required sub-Field that is empty in any entry.
- An empty optional Field whose Match chose `none` counts with its Match probability for `none`.
- Raw signals and whether a user corrected the value are stored with every Field Value for later calibration. They are never sent.

### Auto-Send and Approval

- Auto-Send is evaluated **once**, right after an Extraction succeeds (including a successful manual retry). It approves automatically only if all of the following hold:
  - the Form's Auto-Send is on;
  - nothing on the Document is Needs Review;
  - the Document is Jev-verified;
  - "Does not fit this Form" is not set;
  - "user touched" is not set (no correction, Change Form or Reopen).
- Manual Approval requires that nothing is Needs Review. There is no "Approve anyway".
- Approval creates one Delivery per Integration attached to the Form at that moment. With none attached, the Document is approved and nothing is sent.

### Form Proposal

- Only an Admin can create one. Read runs in the background exactly as in an Extraction. Then **one** vision-model call (configuration) receives the Reading plus the page images and text layer, and returns the proposed Fields: label as printed, English camelCase key, English description with the printed synonyms, type from the content, choice only when options are printed, required off, and a ticked flag for purpose-serving Fields.
- "Suggest Fields from PDF" on an existing Form runs Jev Match of the new Reading against the current Form Version and proposes only the Reading parts that matched `none`. Saving creates a new Form Version.
- When the first Form Version is saved, "Also process this sample as a Document" (on by default) runs Match, Fill and Verify on the stored Reading. When it's off, the sample's PDF and Reading are deleted at once.

### Payload and Delivery

- Envelope, from the Integration delivery ticket:

  ```json
  {
    "event": "document.approved",
    "deliveryId": "…",
    "test": false,
    "document": { "id": "…", "filename": "…", "uploadedAt": "…" },
    "form": { "id": "…", "version": 3 },
    "approval": { "mode": "manual" | "auto", "by": "<user id or null>", "at": "…" },
    "data": { /* the Payload, keyed by the Form's Fields */ }
  }
  ```

- `data` has every key of the Form Version. `null` means no value. A List Field is an array of objects keyed by sub-Field keys, or `[]`. Dates are ISO strings, and a choice holds the option's value. Confidences, read text, the Reading and a PDF link are never included.
- **Signing:** HMAC-SHA256 over the raw body with the Integration's secret, sent in a request header, next to the Integration's static headers.
- **Success and retries:**
  - Any 2xx within 15 s succeeds.
  - A timeout, network error, 408, 429 or 5xx is retried via the Convex scheduler with exponential backoff and jitter (about 1m, 5m, 30m, 2h, 6h, roughly 8h in total), honouring `Retry-After`.
  - Any other 4xx fails at once.
  - Every attempt, including a manual re-send, uses the same `deliveryId` and is freshly signed with the Integration's current configuration.
- Detaching or deleting an Integration fails its open Deliveries with "Integration removed", and those can't be re-sent.
- A test-send is not a Delivery. It uses dummy values generated from the Form Version, or a chosen processed Document, marked `"test": true`, and the response is shown inline.

### Review screen (from the [review screen prototype](issues/10-review-screen.md), variant A)

- Side by side: the PDF viewer (page n/N, zoom) on the left and the grouped Fields on the right, with List Fields per entry. A filter switches between "All fields" and "Needs Review only". The two panes stack on mobile.
- Each row shows the label and key, the editable value, "Read on page N:" with the read text, a confidence bar with a threshold tick and the number to two decimals, and the Needs Review label with its reason and lowest signal. Its actions are "Value is right" and Undo.
- Each List Field has a completeness row with "Add entry" and "Entries are complete", and each entry has a remove action. Selecting a row jumps the PDF to its source page. There is no region highlight.
- The Approve button reads "Approve (N left)" or "Approve and send", with "Approve and next" beside it. Change Form and Reject sit next to it. The screen also shows the "not verified by Jev" marker, the "Does not fit this Form" banner, an Extracting overlay with the fields disabled, and the Extraction Failed state with Retry.
- The Document list has tabs by state with counts (Needs Review, Approved, Failed, Rejected), opening on Needs Review. Documents being read have their own Extracting page, linked with its count from the list's header. Status updates arrive live through Convex subscriptions.

### Retention

A daily Convex cron deletes data, including the R2 objects:
- A Document's PDF, Reading, Field Values and Payload go N days after its last successful Delivery (default 30, set per Organisation). The same applies to a Document approved without an Integration, counting from its Approval.
- Documents that never get Approval go after 90 days.
- A Rejected Document's data goes 30 days after Reject.
- An unsaved Form Proposal goes after 7 days.

Metadata, history and Delivery logs are kept.

## Testing Decisions

- **Good tests test external behaviour through the highest seam.** They call public Convex functions as a given user in a given Organisation and assert on what that user can then observe: a Document's state, its Field Values and flags, and the Deliveries and requests made. They never assert on internal helpers, table layouts or prompt text.
- **Seam 1 (primary, runs in CI): the public Convex API under `convex-test`.** Every external service sits behind the adapter boundary and is faked there: the vision Reader, Jev Match and Verify, the Fill model, R2 storage, and outbound HTTP to Integrations. The fakes replay **recorded responses from the 5 fixtures** (Readings, Jev choices and verifications, fills) plus scripted failures. This one seam covers:
  - **Tenancy:** a user can never read or change another Organisation's data, and Member is refused Admin-only functions.
  - **Field model and Payload:** type validation, required rules and List rules, and a Payload with every key, `null` and `[]`.
  - **Pipeline orchestration:**
    - Read, Match, Fill and Verify run in order, and the Reading is stored.
    - Failure after retries leads to Extraction Failed, and a retry resumes from the Reading.
    - A Verify failure still succeeds, but the Document isn't Jev-verified.
    - The 64k split works.
  - **Confidence and Needs Review:** the minimum of the signals, every Needs Review reason, List completeness, and threshold changes that apply only to new Extractions.
  - **Auto-Send:** every blocking condition, and evaluation happening exactly once.
  - **Review actions:** Corrected and Checked, adding and removing entries, and Approval blocked while anything is Needs Review.
  - **Change Form, Reject, Reopen and Delete:** the rules above, including the dropped corrections and the post-Approval lock.
  - **Delivery:**
    - the envelope and the HMAC signature;
    - the classification of 2xx, retryable and fatal responses;
    - backoff (with a fake clock), `Retry-After` and a manual re-send with the same `deliveryId`;
    - "Integration removed", and no back-send.
  - **Form Proposal:** a stubbed proposal leads to a Form Version, the sample-as-first-Document path, and the "Suggest Fields from PDF" `none`-only rule.
  - **Retention:** the cron deletes the right data at the right time.
- **Seam 2 (not in CI): the fixture eval harness.** A script runs the real pipeline (Vertex reader, Jev, the Fill model) on `fixtures/documents/*` and scores against each `expected.json`, counting only `verified` paths. It reports values correct out of 84, List entries out of 4, Needs Review precision and recall at the threshold, cost and latency. It is used to choose and pin models on Vertex EU and to catch prompt regressions. The bar is the ADR 0003 benchmark: 80/84 values and Lists 4/4. Its outputs double as the recorded responses Seam 1 replays.
- **Prior art:** there is no application code yet. The benchmark scripts on the branches `prototype/extraction-benchmark` and `prototype/api-pipeline-benchmark` are the starting point for Seam 2's scoring. The review-screen prototype (`prototype/review-screen`) is the visual reference, and it is not tested.
- UI components get no automated tests in v1 beyond what the Convex seam covers. Browser E2E is out of scope.

## Out of Scope

- Intake by email, mailbox or API; v1 is upload only.
- Automatic Document-type detection (choosing the Form for the user).
- Splitting a PDF into several Documents, and PDFs over 20 pages.
- Re-extracting a single page, and region highlighting and bounding boxes in review.
- Learning from corrections, confidence calibration, and growing the test set to 30–50 Documents.
- Mapping Fields onto an external system's target fields, pre-built Integrations (Exact, AFAS, …) and an agent that builds Integrations.
- OAuth2 for Integrations, email notifications for failed Deliveries, a PDF link in the Payload, and automatic re-send after a correction.
- A fallback matcher, or switching Jev off per Organisation.
- SSO, 2FA, per-Form permissions and CI/CD.
- Billing and pricing.
- Subprocessor paperwork (TypeSafe zero-retention quote, DPA/SCC, TIA). This is a pre-launch task, not build work.
- Regex, min/max and cross-Field validation rules.

## Further Notes

- **Build-time checks, in this order:**
  1. that pdf-inspector's native module loads in a Convex Node action (if not, the fallback is to extract the text layer outside Convex);
  2. Vertex EU availability and pinned versions for the chosen reader and fill models;
  3. the reader's real cost and latency, and whether the 10-minute action limit holds at 20 pages.
- **Launch blockers (not build blockers):** TypeSafe's enterprise zero-retention quote and the transfer impact assessment, because TypeSafe receives the whole Reading, personal data included. List every subprocessor on the site.
- **Known behaviour at the 0.8 threshold:** about a quarter of correct values are flagged, and no fixture Document would be auto-sent. Jev is blind to handwriting misreads, so `_unsure` and conflict flags plus human review cover those. The 0.8 threshold stays until calibration.
- The ground truth for tire-service-002 (one tyre change) is unverified by the user.
- Language: the app, code and all terms are in English; Field labels may be in any language.
