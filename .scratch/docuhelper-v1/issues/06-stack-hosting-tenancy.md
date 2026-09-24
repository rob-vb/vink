# Stack, hosting and tenancy

Type: grilling
Status: resolved
Blocked by: 

## Question

Which stack and hosting for v1: framework (e.g. Next.js/TypeScript), database, background job queue for extraction, file storage for PDFs, EU hosting. How are tenants, users and roles modelled, and what are the data-retention rules for uploaded Documents? Note: EU processing of Claude is only possible through Vertex AI or Bedrock EU, not Anthropic's own API. That may steer the choice of cloud.

## Answer

Settled with the user on 2026-09-23. The new terms **Organisation** and **Membership** are recorded in `CONTEXT.md`. The backend choice is recorded in [ADR 0001](../../../docs/adr/0001-convex-cloud-eu-backend.md).

- **Hosting:** Next.js (App Router, TypeScript) runs on the user's existing Hetzner VPS in Helsinki with pm2, nginx and certbot, like their other apps. The extra 30 GB volume is free for logs and backups.
- **UI:** shadcn/ui components on Tailwind CSS (added 2026-09-24).
- **Backend:** Convex Cloud EU (`eu-west-1`) is the database, backend, scheduler and cron. There is no separate worker. Extraction is a Node-runtime Convex action run through `@convex-dev/workpool`, which limits concurrency and handles retries. One run must finish within 10 minutes; longer PDFs are split per page, which is for the pipeline tickets. Delivery retries (backoff up to about 8 h) use the Convex scheduler. Convex is deployed with `npx convex deploy`. CI/CD comes later.
- **Files:** PDFs are stored in Cloudflare R2 with EU jurisdiction via `@convex-dev/r2`. The reviewer sees them through short-lived signed URLs, issued only after a Membership check. The extraction action reads the bytes and passes them to Vertex.
- **Auth:** Better Auth via `@convex-dev/better-auth`, with email and password plus magic link. SSO and 2FA come later.
- **Sign-up:** anyone can sign up. The person who signs up becomes Admin of a new Organisation. Admins invite users by an emailed link, sent through Resend (EU region, or listed as a subprocessor).
- **Tenancy:** a user can belong to several Organisations through Memberships. The roles are **Admin** (Forms, Integrations, thresholds, users) and **Member** (upload, review, approve). There are no per-Form permissions. The active Organisation is in the URL (`/o/<slug>/…`).
- **Isolation:** all data sits in one Convex deployment. Every table has an indexed `organisationId`. Every query, mutation and action goes through a custom wrapper (`convex-helpers`) that resolves the Membership, checks the role and injects `organisationId`. A lint rule bans raw `query`/`mutation` imports, and a test checks that no data leaks between Organisations.
- **Retention:** a PDF is deleted 30 days after its last successful Delivery by default, and an Admin can change this per Organisation. Documents that never get Approval are deleted after 90 days. Field Values and the Payload are deleted along with the PDF. Metadata and the Delivery log are kept. A daily Convex cron does the deletion, including the R2 objects.
- **Subprocessors:** Convex, Cloudflare, Google (Vertex) and Resend. Whether TypeSafe/Jev joins them is decided in Extraction pipeline design.

