# 19 — Invitations and Memberships

Type: task
Status: resolved
Blocked by: 18

## What to build

An Admin invites colleagues by email (sent through Resend EU) with the role Admin or Member. The invited person accepts through the link and lands in that Organisation. A user with **Memberships** in several Organisations switches between them, and the active one is always visible in the URL. An Admin can change a Member's role or remove their Membership. Members are refused every Admin-only function.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for the invite dialog, the members table and the Organisation switcher. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] An Admin can invite by email with a role, and the Invitation carries a token and an expiry
- [x] Accepting a valid link creates the Membership and lands the user in `/o/<slug>`. An expired or used link shows a clear error
- [x] A user with several Memberships can switch Organisation, and the slug in the URL changes with it
- [x] An Admin can change a role or remove a Membership. The last Admin can't be removed or demoted
- [x] `convex-test`: a Member calling an Admin-only function is refused, and a removed user loses access at once

## Comments

- 2026-09-24 — Built on branch `ticket-19-invitations` (off `ticket-20-form-editor`). Backend: `convex/invitations.ts` (`invite`, `revoke`, `preview`, `accept`, internal `send`) and `convex/memberships.ts` (`list`, `changeRole`, `remove`, internal `backfillEmails`). Table `invitations` keeps only a SHA-256 hash of the token and expires after 7 days; inviting the same address again replaces the open Invitation, so only the latest link works. An existing Member's address and malformed addresses are refused. Mail goes through `internal.invitations.send` → `sendEmail` (Resend when `RESEND_API_KEY` is set, otherwise the Convex logs).
- Accepting needs the signed-in user's email to match the invited address (decided with the user). `userQuery`/`userMutation` now inject a lower-case `email` from the JWT. Memberships store the email for the Members list; it's optional in the schema only for Memberships made before this ticket — run `npx convex run memberships:backfillEmails` once per deployment (done on dev: 7 filled; **still to do on prod**).
- The last Admin can't be demoted or removed (`LastAdmin`). In the UI, your own row has no role select or Remove, so an Admin can't lock themselves out of the Members page.
- UI: `/o/<slug>/members` (Admin-only, 404 for a Member) with the invite dialog, members table and pending invitations (Revoke); the Organisation switcher replaces the name in the header, and a Members link sits next to Forms. The header nav drops to a second row at phone width. `/invite/<token>` shows sign in / create account when signed out; sign-in and sign-up take `?next=/invite/<token>` (only invite paths are honoured), and sign-up via an invite skips creating an Organisation. Error cards for not found, used, expired and another address.
- Tests: 9 in `convex/invitations.test.ts` (Resend stubbed at its HTTP boundary; the token is read from the sent mail) and 7 in `convex/memberships.test.ts`. Checked end to end in headless Chrome against dev: invite ×3, a new user signing up from the link and accepting, a signed-in user with their own Organisation accepting and switching, wrong-address and used-link cards, role change, remove (removed user gets a 404 at once), phone width.
- Mobbin references used:
  - Invite dialog: [Lindy](https://mobbin.com/screens/a5b4d331-f489-4794-a946-1d956cfbce9e), [AirOps](https://mobbin.com/screens/6d31a8ea-be80-4596-bdc3-60cc635cb3f2), [Braintrust](https://mobbin.com/screens/229164d8-95be-4987-bd68-84e2c7ca6f1a)
  - Members table and pending invitations: [Sentry](https://mobbin.com/screens/6b778223-e7d5-42b1-82c9-ccd8d191ca0f), [OpenAI Platform](https://mobbin.com/flows/31206669-81e9-4a71-92d0-a0672599ed67), [Grok](https://mobbin.com/flows/05dfa10f-542d-49bb-abb4-bd138cc3271b), [Todoist](https://mobbin.com/flows/e27eb911-51c5-4310-b531-69ffa2fb3f9e)
  - Organisation switcher: [Air](https://mobbin.com/screens/fa59dedd-7f78-48a1-b5bc-a628f154af8e), [Notion](https://mobbin.com/screens/7d92c438-ee81-4dda-8eaf-f7ee1ffb4ed3), [Unity](https://mobbin.com/screens/75539be8-f9ca-457f-b9c1-2682f546c3a2)
  - Accept page and its errors: [PlanetScale](https://mobbin.com/screens/a40a607c-05dc-4b2a-a05d-a455ef343d92), [Vercel](https://mobbin.com/screens/b1694ff0-61f0-4395-bd9a-afaadad03541), [Grok](https://mobbin.com/screens/7b80eb41-1457-4075-abcb-52c90608b1a7), [Jitter](https://mobbin.com/screens/8e377ce4-ec67-4894-8310-589e6b2a25bd)
