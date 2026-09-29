# Wrong Form or unusable Document

Type: grilling
Status: resolved
Blocked by: 

## Question

What can a user do in review when a Document was uploaded against the wrong Form, or isn't a usable Document at all (blank, unreadable, not a tyre report)? Options seen in similar apps: change the document type in review and extract again (QuickBooks), Reject (Airwallex) or Delete (Mercury). Decide which actions v1 has, and what each one does:
- to the Document's state and its Form Version;
- to existing corrections;
- to retention of the PDF;
- to Deliveries (a rejected Document is never sent).

Also decide whether "Reject" is a state that shows in the Document list or just a delete. Surfaced by the Mobbin scan on [Review screen prototype](10-review-screen.md).

## Comments

**2026-09-24 (from API pipeline benchmark):** Under ADR 0003 the Reading doesn't depend on the Form. "Change Form" can re-run Match and Fill on the stored Reading without reading the PDF again: about $0.002 and 1 s instead of a new vision call.

## Answer

Settled with the user on 2026-09-24. The term **Rejected** is recorded in `CONTEXT.md`. Auto-Send and the relationships are sharpened there too. No ADR was written: every call below is cheap to change.

v1 has three actions next to Approve: **Change Form**, **Reject** and, for Admins only, **Delete**. None of them is possible after Approval, because a Document that has been sent is done.

- **Change Form** (Member or Admin, before Approval, including Extraction Failed):
  - The Document moves to the **current** Form Version of the chosen Form.
  - Match and Fill run again on the stored Reading, and Jev verifies again. If there is no Reading (the Read step failed), a full new Extraction starts instead.
  - All Field Values and corrections for the old Form are dropped. Nothing is carried over, not even Fields with the same key. If there are corrections, the confirmation dialog warns first ("3 corrections will be lost").
  - The Document history gets a line: "Form changed from X to Y by Z".
  - The Document can no longer go out through Auto-Send. Changing the Form counts as a user action, like a correction.
- **Reject** (Member or Admin, before Approval):
  - **Rejected** is an end state, not a delete. It shows in the Document list behind a filter that is off by default, with who rejected it, when, and an optional reason.
  - A Rejected Document is never approved and never gets a Delivery.
  - Its PDF, Reading and Field Values are deleted **30 days after Reject**, the same as 30 days after Delivery. Its metadata is kept.
  - **Reopen** is possible while the PDF is still kept. The Document goes back to its state before Reject, with its Field Values and corrections intact, and it can no longer go out through Auto-Send.
- **Delete** (Admin only, and only on a Rejected Document): the PDF, Reading and Field Values are deleted at once, for example for private data that was uploaded by mistake. Only a metadata line "Deleted by X" remains.
- **"Does not fit this Form"** is a Document-level flag set in code from the Match result, with no extra Jev call. It is set when the Reading is empty, or when fewer than half of the required Fields were matched; the exact cut-off is configuration. A flagged Document never goes out through Auto-Send, and the review screen shows the flag with Change Form and Reject beside it. Choosing the Form automatically stays in the fog (Automatic Document-type detection).
