# Intake email Worker

Receives every email sent to a Form's Intake Address (`<token>@<intake domain>`),
stores its PDF attachments in the app's EU R2 bucket under `intake/…`, and calls
Vink's Convex HTTP action `POST /intake/email`. All decisions (which Form, page
limits, Pages quota, Recent emails, Admin alerts) live in `convex/intake.ts`.
The Worker never replies to the sender.

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
- 10 MiB per PDF attachment (`MAX_BYTES`, the same limit as `convex/lib/pdfLimits.ts`); a larger one is listed as `too_large` and shows as refused.
- PDFs over 20 pages, unreadable PDFs and PDFs that don't fit the Organisation's
  Pages are refused by Vink and removed from R2.
- If Vink is unreachable, the Worker throws so the sending server retries later.
  PDFs stored for such an attempt stay in R2 until the orphan-upload cleanup.

The mapping from a parsed email to what is stored and sent (`src/map.ts`) is
tested from the repo root: `npx vitest run workers`.
