# Review screen prototype

Type: prototype
Status: resolved
Blocked by: 04

## Question

What should the Needs Review experience look like: PDF side by side with the Form's Fields, highlighting where a value came from, confidence display, correcting values, and the Approval action? Build a rough clickable UI prototype to react to.

## Comments

**2026-09-23 (from Field model):** The prototype should show the read text next to the normalised value, List Field entries (adding and removing them, with the completeness confidence), required Fields without a value, and values that don't fit their type (`null` plus the read text).

**2026-09-23 (from Extraction pipeline design):** Each Field Value and List entry carries its source page(s), so the review screen can jump to the right page. There are no bounding boxes in v1. Also show:
- the **Extraction Failed** state, with a manual retry;
- a marker for Documents that Jev didn't verify, which are manual Approval only.

**2026-09-23 (from Confidence semantics and auto-send rules):** Confidence is a ranking score, not a chance, so never show it as a percentage "chance". For each Needs Review value, show why: which signal was lowest (model, Jev fit, Jev source support) or which code check failed. The Form settings need a Review Threshold (default 0.8) and an Auto-Send switch, which is disabled with the reason when Jev is off for the Organisation.

## Answer

Settled with the user on 2026-09-23. The prototype with its three variants is on branch `prototype/review-screen` (`prototypes/review-screen/index.html`) and published as an [artifact](https://claude.ai/artifact/5WuiVKh2QtovcHeBuquecy). It uses a synthetic tyre bundle, not customer data.

- **Layout: variant A, "Side by side".** The PDF sits on the left in a scrollable pane, and all of the Form's Fields are on the right, grouped, with List Fields shown per entry. A filter switches between "All fields" and "Needs Review only". The pages stack on mobile. Rejected: B ("One at a time", a queue with a zoomed crop) and C ("On the page", value chips on the PDF).
- **Source link:** a nice-to-have, built only as far as it is cheap. v1 has no bounding boxes (see [Extraction pipeline design](08-extraction-pipeline.md)), so selecting a row jumps the PDF to the value's source page. Highlighting the region is not needed.
- **Each row shows:**
  - the label and key;
  - an editable value;
  - "Read on page N:" with the read text;
  - a confidence bar with a tick at the Review Threshold, and the number next to it (two decimals, never a %);
  - a Needs Review label and the reason (below the threshold, required but empty, or doesn't fit the type), plus the lowest signal and any model note;
  - the actions "Value is right" and "Undo".

  Editing a value marks it Corrected, and "Value is right" marks it Checked. Both clear Needs Review.
- **List Field:** a completeness row shows the page inventory ("Page 3: tyre sheet → no entry"), the completeness confidence and the reason. Its actions are "Add entry" and "Entries are complete". Each entry can be removed. A merged bundle is fixed by adding an empty entry and filling it in by hand. Re-extracting a single page is not in v1.
- **Approval is blocked** while anything is still Needs Review. The button reads "Approve (N left)" and becomes "Approve and send" once everything is checked. There is no "Approve anyway".
- **Also required (from earlier tickets, not prototyped):**
  - the Extraction Failed state, with a manual retry;
  - a "not verified by Jev" marker, for Documents that can only be approved by hand;
  - the Review Threshold and Auto-Send switch in the Form settings, with Auto-Send disabled and the reason shown when Jev is off.

No ADR was written. These are UI calls that are cheap to change.

## Comments (after resolution)

**2026-09-23 (Mobbin scan of similar apps):** These apps put the document next to a form of extracted fields: [Airwallex](https://mobbin.com/screens/d6fa70dc-46b6-41e0-9771-d61e758980a3), [Xero](https://mobbin.com/screens/7d6e7353-b970-47a3-a98f-16e0568ea59a), [QuickBooks](https://mobbin.com/screens/66740512-e367-476d-93a7-ea701554e76b), [Revolut Business](https://mobbin.com/screens/ba58e58f-980b-490e-b766-691a9583af82), [Melio](https://mobbin.com/screens/b7289611-7fc4-4097-8cd2-d26ce348d1a8) and [Deel](https://mobbin.com/screens/10d935d5-f3f8-448b-8bb5-0c7195e61ed4). This confirms variant A. Patterns worth adopting in the spec:
- **PDF toolbar:** page n/N navigation and zoom (Airwallex, Xero, Deel). Zoom matters for handwriting.
- **Extracting state:** the Document is shown with a progress overlay or skeleton and the fields are disabled ("may take up to a minute"): [Airwallex](https://mobbin.com/screens/7228964b-3706-452e-9e70-2973fbb5e5b9), [Mercury flow](https://mobbin.com/flows/332881d8-7f08-46ec-bc6d-5a669ea56e0d).
- **"Approve and next":** QuickBooks' "Save and next" moves straight on to the next Document that needs review.
- **Document list tabs by state, with counts:** Mercury (Inbox / Needs Approval / Scheduled / Paid) and [Acctual](https://mobbin.com/flows/8131cf84-1b89-4dde-a474-a87c42c32316) (Draft / Approve / Ready / Paid). Midday shows an "Analyzing" badge per row. For Vink that means Extracting / Needs Review / Approved / Failed.
- **Reject or Delete next to Approve** (Airwallex, Mercury). This is missing from our screen.
- **A per-item marker for AI-filled values and "Review required"** (Revolut). It matches our Needs Review label.
- Xero marks the source lines in the PDF margin. That needs line positions, which v1 doesn't have.
- None of these apps shows a confidence number, only a flag. Our bar plus number is a deliberate choice.

Surfaced question: what does a user do when a Document was uploaded against the wrong Form, or isn't a usable Document at all? QuickBooks lets you change the document type in review, and Airwallex offers Reject.
