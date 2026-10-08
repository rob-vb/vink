# Intake email Worker

Receives every email sent to a Form's or the Organisation's Intake Address
(`<token>@<intake domain>`), stores its PDF and image (JPG, PNG, HEIC)
attachments in the app's EU R2 bucket under `intake/…`, and calls Vink's Convex
HTTP action `POST /intake/email` with the whole mail: subject, date, text
(text/plain, else the HTML as text) and the attachment list. The Worker does not
know which kind of address it is: the token tells Vink. All decisions (which
Form or the Router, one Document or several, page limits, Items quota, Recent
emails, Admin alerts) live in `convex/intake.ts`. The Worker never replies to
the sender.

## Deploy (once the permanent intake domain is on Cloudflare)

1. Add the intake apex to Cloudflare and enable **Email Routing** for it.
   Turn on the catch-all rule with action **Send to a Worker** → `vink-intake-email`.
   Email Routing rejects mail that fails DMARC with `p=reject`; the Worker also
   bounces anything whose `Authentication-Results` says `dmarc=fail`.
2. In this folder: `npm install`, fill in `CONVEX_SITE_URL` and `bucket_name`
   in `wrangler.toml`, then `npx wrangler secret put INTAKE_SECRET` and
   `npx wrangler deploy`.
3. On the Convex deployment set the same `INTAKE_SECRET`, and `INBOUND_DOMAIN`
   to the intake apex, so the app shows the addresses.
4. Send a test mail with one PDF and one image to a Form's address and check
   the Form's Recent emails.

Use a throwaway domain for development and testing. No customer gets an address
until the permanent intake domain is live.

## Limits

- 25 MiB per message (Email Routing's limit); larger mail is rejected.
- Copies of `convex/lib/inputLimits.ts` in `src/map.ts` (`map.test.ts` fails when
  one drifts): 10 MiB per PDF (`too_large`) and per image (`image_too_large`),
  12 MiB for all attachments of a mail together (`attachments_too_large`; they go
  to the vision model in one request), at most 10 PDF and image attachments
  (`too_many_attachments`), and 200 KiB of text (a longer text is not sent, with
  `bodyTooLarge`). Any other file type is `unsupported_type`. Each shows as refused.
- A small inline image (under 50 KiB, Content-Disposition inline or shown by the
  HTML through `cid:`) is a signature logo or icon: the Worker drops it, so it is
  not stored, not listed and not counted. A phone's inline photo is far larger
  and stays. Vink does no such filtering itself.
- PDFs over 20 pages, unreadable PDFs and mail that doesn't fit the Organisation's
  Items are refused by Vink and removed from R2.
- If Vink is unreachable, the Worker throws so the sending server retries later.
  PDFs stored for such an attempt stay in R2 until the orphan-upload cleanup.

The mapping from a parsed email to what is stored and sent (`src/map.ts`) is
tested from the repo root: `npx vitest run workers`.
