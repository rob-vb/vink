# Vink on Zapier

A Zapier Platform CLI app (`zapier-platform-core` 19) on Vink's public API (`https://vink.page/v1`).

- **Auth:** an API Key (`Authorization: Bearer …`), tested with `GET /v1/forms`. The connection is labelled with the key's hint, `vink_live_…abcd`.
- **Trigger "Submission Approved"** (`triggers/submission-approved.js`): a REST hook on `POST`/`DELETE /v1/subscriptions`. The Form is a dropdown filled by the hidden trigger `forms`. The sample comes from `GET /v1/forms/{id}/sample`, the output fields from the Form's Fields. List Fields arrive as line items.
- **Action "Send in a Submission"** (`creates/send-submission.js`): streams a Zapier file (or any URL) as the multipart part `file`: a PDF, a JPG, PNG or HEIC photo, or an `.eml` email. With a Form it goes to `POST /v1/forms/{id}/submissions`; with the Form left empty, Vink's Router picks the Form (`POST /v1/submissions`, `state: no_form` when none fits). The action answers with the new Submission's `id` and `state` (`processing`) only. A refusal shows Vink's own message.

## Work on it

Everything runs inside this folder; it has its own `package.json` and `node_modules`. The repo's root tsc, eslint and vitest skip it.

```sh
cd integrations/zapier
npm install
npm test                                   # jest + nock, no network
npx zapier-platform-cli validate           # schema + Zapier's integration checks, no login needed
```

## Push a private version

1. Install the CLI: `npm install -g zapier-platform-cli`.
2. `zapier login` with the Vink Zapier developer account.
3. First time only: `zapier register "Vink"`. It writes `.zapierapprc` (the app's id). Commit that file, so every later push goes to the same app.
4. `zapier push`. It uploads the version in `package.json` (`1.1.0`). Raise the version for every change that is live in Zaps (`npm version minor`), then push again.

To try it: in Zapier, make a Zap with the trigger "Vink → Submission Approved", connect with an API Key from Vink (Organisation settings → API Keys), pick a Form, and approve a Submission in Vink. Then a Zap with the action "Send in a Submission" and a PDF.

## Invite testers

- `zapier users:links` prints a public invite link for the current version.
- `zapier users:add someone@example.com 1.0.0` invites one person by email.

## Submit for the public directory

Do this after a private Zap has moved a real Submission end to end.

1. In the Zapier Developer Platform (developer.zapier.com → Vink): fill in the app's logo (256×256 PNG), description, category, homepage `https://vink.page` and the API Key help link.
2. Run `zapier validate` once more. Every "Publishing Task" must be done.
3. Make sure the trigger and the action each have a live Zap that ran at least once; Zapier's publishing checks ask for it.
4. Developer Platform → Publishing → "Submit for review". Zapier reviews it and answers by email.
5. Once it is public: `zapier promote <version>` for later versions, and in the site switch Zapier from "via webhook" to native (`lib/platforms.ts`) and check `app/llms.txt/route.ts`.
