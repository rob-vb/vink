# Convex Cloud EU as backend, not Postgres on our own VPS

The Next.js app runs on our own Hetzner VPS (Helsinki), but the database, backend functions, job queue (Workpool), scheduler and crons live in Convex Cloud in `eu-west-1`. PDFs go to Cloudflare R2 with EU jurisdiction via `@convex-dev/r2`. We chose this over Postgres (with pg-boss) on the VPS because the developer already runs Convex with Better Auth in other projects, live status for review comes built in, and the shared VPS has little RAM to spare. The cost is lock-in to Convex's data model and two extra subprocessors (Convex and Cloudflare), both in the EU.

## Consequences

- Convex has no row-level security. Isolation between Organisations lives in custom function wrappers that check the Membership, and raw `query`/`mutation` exports are banned by lint.
- Extraction runs as a Convex action, so one run must finish within 10 minutes.
