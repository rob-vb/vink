# Email-in and cloud-storage intake: feasibility and cost

Type: research
Status: resolved
Blocked by: 

## Question

What does it take for Vink to receive Documents by email and from cloud storage, as input for Volume intake at launch? Cover:

- **Email-in**: inbound providers that fit (Resend inbound if it exists, Cloudflare Email Routing/Workers — we already use R2 —, Postmark, Mailgun, SES): EU processing/storage, price at ~5–20k mails/month, webhook payload (attachments inline or fetched, size limits), catch-all/subdomain addressing (`<token>@in.<domain>`), SPF/DKIM/DMARC checks available to reject spoofed senders, and what happens to addresses when the domain moves (docuhelper.robvb.com → a future vink domain).
- **Cloud storage "watch a folder"**: Google Drive (which scope can watch a user-chosen folder for new files — `drive.file` + Picker vs `drive.readonly`; restricted-scope verification / CASA assessment cost and timeline; push notifications vs polling), Microsoft OneDrive/SharePoint (Graph scopes, user vs admin consent, change notifications/delta, publisher verification), Dropbox (scopes, webhooks, app review), iCloud Drive (is there any third-party API at all?).
- Per option: rough build size, recurring cost, and review/verification hurdles before launch.

Output: a comparison table and a recommendation of what is realistic at launch vs later.

## Answer

| Option | EU data | Cost at 5–20k/mo | Payload / size | Hurdle | Build |
|---|---|---|---|---|---|
| Email: Cloudflare Routing + Worker | PDFs to our EU R2; nothing stored at a US provider | $0 routing + $5 Workers Paid | Raw MIME in Worker, 25 MiB | Needs Cloudflare DNS; catch-all apex-only | 3–5 days |
| Email: Resend inbound | Account data stored in US, 30 days | Counts as sends: Pro $20/50k | Metadata webhook, fetch via API; forge-proof SPF/DKIM/DMARC | none | 2–3 days |
| Email: SES eu-central-1 | EU region + S3 | ≈$4–16 | Raw MIME to S3, 40 MB; SPF/DKIM/DMARC verdicts | AWS setup | 4–6 days |
| Email: Postmark / Mailgun | US / EU | ≈$30 / $35 | base64 inline 35 MB / multipart | Pro plan / Foundation | 2–4 days |
| Google Drive watch | — | CASA ≈$540–5,400/yr | push (≤1 wk) + changes.list | `drive.readonly` restricted → annual CASA, weeks | 6–8 days + review |
| OneDrive / SharePoint | — | $0 | root subscription (≤42,300 min) + root delta | Publisher verification (free); SharePoint scopes need admin consent | 6–8 days |
| Dropbox | — | $0 | webhook (ids only) + list_folder cursor | Production review at 50 users | 4–6 days |
| iCloud Drive | — | — | no third-party API | impossible | — |

**Recommendation.** At launch, ship email-in only, via Cloudflare Email Routing and a Worker. The Worker writes each PDF to R2 and calls a Convex HTTP action that reuses the `documents.create` checks (token, quota, 20 pages).

- **Addresses.** Use `<token>@<intake-domain>` on a Cloudflare apex that never moves: the future Vink domain, or a dedicated intake domain chosen now. Store only the token and keep the domain in `INBOUND_DOMAIN`. Then the docuhelper → vink move doesn't touch customer addresses. If an interim domain is used, keep it live for 12 months or more.
- **Spoofing.** The unguessable, rotatable token is the main guard. Cloudflare rejects DMARC failures. Never auto-reply.
- **Resend** is the quickest wiring, but its US storage undercuts "Stored in the EU", so it is a stopgap at most. **SES Frankfurt** is the EU-strict fallback.
- **Storage connectors come later.** Order: Dropbox App folder, then OneDrive (`Files.Read`, verify publisher first), then SharePoint (admin consent). Google Drive watch waits until demand justifies CASA; a Picker import on `drive.file` is the cheap manual option before that. iCloud users get email-in.

Full findings: branch `research/email-and-storage-intake`, file `.scratch/vink-marketing/research/email-and-storage-intake.md`
