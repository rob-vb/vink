# 18 — Walking skeleton: sign up into your own Organisation

Type: task
Status: resolved
Blocked by: None — can start immediately

## What to build

A new visitor signs up with email and password or a magic link, and automatically becomes Admin of a new **Organisation**. They land on that Organisation's home at `/o/<slug>`. This ticket lays the groundwork every later ticket stands on:
- the Next.js (App Router, TypeScript) app with shadcn/ui on Tailwind;
- Convex Cloud EU;
- Better Auth via `@convex-dev/better-auth`;
- the tenancy wrapper built with `convex-helpers`, which resolves the caller's **Membership** for the Organisation in the URL, checks the role and injects `organisationId`;
- a lint rule that bans raw `query`, `mutation` and `action` exports;
- the `convex-test` harness (Seam 1) with test helpers for "call as user X in Organisation Y".

See ADR 0001.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for the sign-up, magic-link and sign-in screens and the empty Organisation home. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] Sign-up works with email and password and with a magic link
- [x] The person who signs up becomes Admin of a new Organisation with a unique slug, and is redirected to `/o/<slug>`
- [x] Every public Convex function goes through the tenancy wrapper, and the lint rule fails on a raw `query`, `mutation` or `action` export
- [x] Every table carries an indexed `organisationId`
- [x] A `convex-test` test shows that a user can't read or change data of an Organisation they have no Membership in
- [x] The app runs under pm2 behind nginx on the VPS, and Convex deploys with `npx convex deploy`

## Comments

- The Convex project already exists: **tame-goose-939** (EU). Link the app to it, and don't create a new project. The Convex CLI on the VPS is already logged in.

- 2026-09-24 — Built on branch `ticket-18-walking-skeleton`. Tests: 10 at Seam 1 (`convex/*.test.ts`, helpers in `convex/test.setup.ts`: `signUp`, `asUser`, `addMembership`) and 8 RuleTester cases for `eslint-rules/no-raw-convex-functions.mjs`. Wrappers live in `convex/lib/functions.ts` (`userQuery`, `userMutation`, `orgQuery`, `orgMutation`; pass `role: "admin"` for Admin-only). There is no `orgAction` yet: add it with the first action (ticket 23). `organisations` is the tenant root, so it has no `organisationId`; every other table does. Both sign-up paths were checked end to end in headless Chrome against the dev deployment. Magic links are written to the Convex logs until `RESEND_API_KEY` (+ `RESEND_FROM`) is set on the deployment.
- Deploy is still open: the prod Convex deployment is `spotted-parakeet-30` (its env vars are set), and the app runs on port 3003. Still to do: the DNS A record `vink.page → 77.42.31.66`, `scripts/deploy.sh` (convex deploy + build + pm2), the nginx site from `deploy/nginx.conf`, and certbot.
- Mobbin references used:
  - Sign-up with password and a magic link sharing one email field: [Coda](https://mobbin.com/screens/d9bdd3c0-6bc4-43e7-9c11-320fbbfb7431), [Workable](https://mobbin.com/screens/35802b2a-095f-48a3-a161-bab66a7c6f2b), [WorkOS](https://mobbin.com/screens/999797ad-5904-4165-bc69-2af2573b849e), [Better Stack](https://mobbin.com/screens/08cf4825-37d3-4cc3-ad86-a046cd6ed1fe)
  - "Check your email" with resend and a different-email option: [Felt](https://mobbin.com/screens/67db25a6-d5a2-4382-9cf0-321ab7f32d48), [Better Stack](https://mobbin.com/screens/facc7659-87e8-43ff-92a4-76139cf54870), [Qatalog](https://mobbin.com/screens/79f9ac38-e747-4780-833a-fa82045ad6a2)
  - Empty Organisation home: [Attio](https://mobbin.com/screens/73c69573-7aa5-468b-accb-96e66de4ce24), [GitBook](https://mobbin.com/screens/5722e06a-7f90-424d-9239-97a878a7e7e6), [Plain](https://mobbin.com/screens/2116f266-fdd5-4706-a1f9-e9f9bc448dcb)
- 2026-09-24 — Live at https://vink.page (pm2 `docuhelper` on port 3003, nginx + certbot, Convex prod `spotted-parakeet-30`). Password and magic-link sign-up were both checked end to end in production.
