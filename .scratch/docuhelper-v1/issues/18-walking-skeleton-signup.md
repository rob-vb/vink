# 18 — Walking skeleton: sign up into your own Organisation

Type: task
Status: ready-for-agent
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

- [ ] Sign-up works with email and password and with a magic link
- [ ] The person who signs up becomes Admin of a new Organisation with a unique slug, and is redirected to `/o/<slug>`
- [ ] Every public Convex function goes through the tenancy wrapper, and the lint rule fails on a raw `query`, `mutation` or `action` export
- [ ] Every table carries an indexed `organisationId`
- [ ] A `convex-test` test shows that a user can't read or change data of an Organisation they have no Membership in
- [ ] The app runs under pm2 behind nginx on the VPS, and Convex deploys with `npx convex deploy`

## Comments

- The Convex project already exists: **tame-goose-939** (EU). Link the app to it, and don't create a new project. The Convex CLI on the VPS is already logged in.
