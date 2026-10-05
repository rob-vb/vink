# Security & privacy page content

Type: grilling
Status: resolved
Blocked by: 

## Question

Which true statements can `/security` make today, and how is the page structured? Positioning and messaging set the frame ("Stored in the EU", TypeSafe listed as a US subprocessor, 30 days after sending by default, 90 if never approved). Check the code for what actually holds — retention jobs, R2/Convex regions, the model provider and region, encryption in transit/at rest, access control per Organisation, signed Payloads, auth (magic link, verified email) — then settle: sections, the subprocessor list, and deletion on request (today only Rejected Documents can be deleted early: build "delete now" for any Document, or say "email us"?). Legal texts stay with the GDPR track.

## Answer

We agreed with every recommendation (2026-09-30). Facts come from a code, prod-env and live-server scan on 2026-09-30; file references are in that scan's findings below.

### Page

- **Audience and shape:** both at once. A plain summary on top that repeats the trust row ("Stored in the EU · Deleted 30 days after sending · Nothing sent without your approval"), then detailed sections an IT or procurement reviewer can check. EN at `/security`, NL at `/nl/security`.
- **Sections, in order:**
  1. Summary
  2. Where your data lives
  3. How long we keep it, and deletion
  4. Who processes it (subprocessor table, anchor `#subprocessors`; the privacy policy and the Home FAQ link here)
  5. Access and accounts
  6. In transit and at rest
  7. What we don't have yet
  8. Reporting a problem and contact
- **What we don't have yet:** short and factual. "No SOC 2 or ISO 27001 certification yet. No two-factor sign-in or SSO yet. A data processing agreement is available on request." The DPA must exist by launch (GDPR track).
- **Security contact:** `security@<domain>` forwarded to the team, behind config so it survives the domain move, plus `/.well-known/security.txt`.

### Statements the page may make (true today, or once the build items below ship)

- **Where it lives:** the app runs in Finland (Hetzner, Helsinki). Database in Ireland (Convex, AWS eu-west-1). PDFs in Cloudflare R2, EU jurisdiction. Reading with Gemini on Vertex AI, EU multi-region.
- **Retention:** "30 days after sending by default. Your Admin can set anywhere from 1 to 365 days." Documents never approved are deleted after 90 days, Rejected Documents 30 days after rejection, and unsaved Form Proposals after 7 days. Deletion removes the PDF, the Reading, all values and the Payload.
- **What stays after deletion:** "We keep a short record (file name, who uploaded and approved it, dates, delivery status), never the document or its values."
- **Deletion on request:** an Admin can delete any Document now (build item). "To close your account or Organisation, email us. We delete everything within 30 days." Self-serve closing comes later.
- **Approval and Auto-Send:** the trust row stays. The page adds: "Auto-Send is off by default. An Admin turns it on per Form, and it only sends Documents with no unsure values." Test-send only sends example values or approved Documents (build item).
- **Access:** each Organisation only sees its own Documents; every request is checked against a Membership, and this is covered by automated tests. Roles are Admin and Member, and the page lists what only Admins can do. Sign-in is by email link (expires after 5 minutes) or password; sessions last 7 days.
- **Transport and at rest:** HTTPS only with HSTS (build item). PDF links expire after 5 minutes. Integration endpoints must use HTTPS. Integration secrets are encrypted (AES-256-GCM) with a key kept outside the database. Data at rest is encrypted by the providers. Payloads are signed with HMAC-SHA256, one secret per Integration (moving to `t=…,v1=…` per Developers page and integration service).

### Subprocessor table (name · purpose · region · data)

| Name | Purpose | Region | Data |
|---|---|---|---|
| Hetzner | Hosting the app | Finland (EU) | passes through all traffic |
| Convex | Database and backend | Ireland (EU) | everything except PDFs |
| Cloudflare R2 | PDF storage | EU | the PDFs |
| Google Cloud Vertex AI | Reading the PDF | EU | the PDF |
| TypeSafe (Jev) | Matching read text to your Fields | United States | the read text, "may keep logs under its own terms" (link) |
| Resend | Sign-in and invitation emails | United States | email address and those emails |

Plus one line: "Transfers to the US rely on the EU–US Data Privacy Framework or Standard Contractual Clauses." The GDPR track picks which. If TypeSafe grants zero retention before launch, drop the "may keep logs" clause. If email-in ships (Volume intake at launch), add Cloudflare Email Routing/Workers, with processing region still unconfirmed.

### Build items for the spec

1. **"Delete now" for any Document:** Admin only, with confirmation. Reuses `deleteData` (`convex/rejection.ts:97-112`), cancels pending Delivery retries, and allows Approved Documents.
2. **Retention gap:** when every Delivery of an Approved Document ends failed, start the retention clock at the last attempt. Today the data is kept forever (`convex/deliveries.ts:338-343`).
3. **Retention maximum:** cap at 365 days instead of 3650 (`convex/organisations.ts:35-43`).
4. **Wipe receiver response bodies** (up to 500 characters per attempt) in `deleteData`.
5. **Orphan uploads:** a daily cleanup rule deletes R2 uploads that never became a Document after 24 hours (`convex/documents.ts:30-36`).
6. **Test-send:** only example values or Approved Documents. Today `needs_review` Documents can be sent (`convex/integrations.ts:256-270,321`).
7. **Security headers** via `next.config.ts`: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, and CSP in report-only first.
8. The `security@` alias and `/.well-known/security.txt`.

### Not built

- A per-Organisation "Jev off" switch. ADR 0002 promised it, but it was never built and stays out of launch (Jev is central to the pipeline). ADR 0002 has been corrected.

### Checks before launch (operational, not spec)

- **`RESEND_API_KEY` is missing on prod**, so magic links and invitations are never sent. Instead they are written to the Convex logs with the full sign-in URL (`convex/email.ts:8-11`). Set the key, verify the sending domain, and clear the old logs if possible.
- **Claude bridge:** stop it under pm2 and remove the nginx `/claude-bridge/` location on prod. The page never mentions Anthropic.
- **TypeSafe zero retention** (already open from Positioning and messaging).
- **Better Auth rate limiting:** in-memory by default; confirm it actually works in the Convex runtime (overlaps with Free Pages abuse and sign-up checks).
