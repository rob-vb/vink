# Volume intake at launch

Type: grilling
Status: resolved
Blocked by: 15

## Question

The app takes one PDF per upload, with no bulk upload, upload API or email-in, while Business promises 3,000 Pages a month (~150 Documents per working day) and Team 1,000. Does the launch need a faster way in — multi-file upload, an upload API, email-in — and if so which one, how big a slice? Or do the plans stay as they are, and the site says plainly how Documents get in today? Settle what the site's Home, Features, Pricing and Developers copy says about intake, and whether any intake work joins the spec or becomes a separate effort. Check the current upload path (`convex/` + the upload UI) before deciding.

## Answer

Today: one PDF per upload (`upload-dialog.tsx` takes `files[0]`), up to 20 pages, checked in `documents.create`; no API, no email-in.

**Launch intake = multi-file upload + email-in. Both join the spec.**

- **Multi-file upload.** The upload dialog accepts several PDFs at once, all into the one chosen Form. Each file gets its own row with progress and its own error (over 20 pages, out of Pages…). Files are checked one by one, so one bad file never blocks the rest.
- **Email-in** as researched in [Email-in and cloud-storage intake](15-email-and-storage-intake-feasibility.md): Cloudflare Email Routing + Worker → R2 → Convex HTTP action reusing the `documents.create` checks. One Intake Address per Form, `<token>@<INBOUND_DOMAIN>`.
  - Admins switch it on and replace it; replacing kills the old address immediately. Every Member can see and copy it.
  - Never reply to the sender. Each PDF attachment becomes a Document; refused attachments (no PDF, >20 pages, >25 MiB, out of Pages) create nothing. The Form's Intake Address panel shows **Recent emails**: the last 50, with sender, time, and per attachment "Document created" or the reason it was refused.
  - Out of Pages: refuse, like at upload, and email the Admins at most once a day ("Emails to [Form] are being refused: out of Pages", with a link to Upgrade/Contact).
  - **Domain.** Rob buys the permanent intake apex (the Vink domain or a dedicated one) later, as a **pre-launch to-do**. Build and test on a throwaway domain via `INBOUND_DOMAIN`. No customer gets an address until the permanent domain is live on Cloudflare.
- **Out of this effort:** an upload API (Developers keeps "no upload API yet, tell us"; any system can already email in) and cloud-storage connectors (not mentioned on the site at all).

**Site copy**
- **Home:** How-it-works stop 1 is "Upload it or email it in"; the hero subline stays about any PDF.
- **Features:** a "Getting documents in" section covering multi-file drag-and-drop and a per-Form email address.
- **Pricing:** FAQ "How do documents get in?"
- **Developers:** "No code? Point any system's email at the Intake Address", next to "no upload API yet, tell us".
- Always say plainly: PDF attachments, up to 20 pages each. Other sources: "Tell us."
