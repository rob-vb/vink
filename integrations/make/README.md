# Vink for Make

The Vink custom app for [Make](https://www.make.com), kept as the local files of Make's
VS Code extension ("Make Apps Editor", local development). `src/makecomapp.json` lists every
component and the file of each code; the other files in `src/` are those codes.

| Component | Local id | What it does |
| --- | --- | --- |
| Base | `general/base.iml.json` | `https://vink.page/v1`, `Authorization: Bearer <API Key>`, errors show Vink's `error.message` |
| Connection | `vink` | Asks for an API Key, checks it with `GET /v1/forms` |
| Webhook (dedicated, attached) | `approvedDocuments` | Form dropdown; attach = `POST /v1/subscriptions`, detach = `DELETE /v1/subscriptions/{id}` |
| Instant trigger | `watchApprovedDocuments` | "Watch approved Documents": outputs the envelope; `data` is built from the Form's Fields |
| Action | `sendDocument` | "Send in a Document": Form dropdown, a file (name + data) sent as the multipart `file` part |
| RPC | `listForms` | The Form dropdown (`GET /v1/forms`) |
| RPC | `formFields` | The trigger's `data` collection: `formFieldsSpec(body.data, webhook.formId)` |
| RPC | `formSample` | The trigger's sample (`GET /v1/forms/{form_id}/sample`) |
| Custom IML function | `formFieldsSpec` | Turns a Form's Fields into Make output fields; a List Field becomes an array of collections |

The Form is a parameter of the webhook, because attach needs it. Attach keeps
`subscriptionId` and `formId` in the webhook's data; detach and the two trigger RPCs read
them as `webhook.subscriptionId` and `webhook.formId`.

## Test without Make

```sh
npx vitest run integrations/make
```

`make-app.test.ts` checks that every file `makecomapp.json` names exists and parses, that
every request is a path and method of the OpenAPI document (`convex/publicApi/openapi`),
that every `rpc://`, connection, webhook and group points at a real component, and runs
`formFieldsSpec` against its own Make IML tests and the API reference's example Form.

The function's Make IML test is `form-fields-spec.iml-test.js`, not `.test.js`, so the
repo's vitest does not pick it up as a vitest file.

## Deploy from these files

1. Make an account at [make.com](https://www.make.com) in the EU1 zone, and an API token
   under Profile → API access with the `sdk-apps:read` and `sdk-apps:write` scopes.
2. In Make, open Custom Apps and create an empty app. Label "Vink", app ID `vink`
   (or the next free ID), theme `#0f1e36`. Upload the Vink icon: `public/vink_icon.svg` as a
   512×512 PNG.
3. Install the "Make Apps Editor" extension in VS Code. Open `integrations/make` as the
   workspace folder.
4. Put the API token in `integrations/make/.secrets/apikey` (the `.gitignore` here keeps it
   out of git). If the app ID or zone differ, change `origins[0]` in `src/makecomapp.json`.
5. Ask Make support to enable custom IML functions for the app ("Custom IML functions are
   not available by default"). Without them `formFieldsSpec` can't deploy and the trigger
   has no Field outputs.
6. Right-click `src/makecomapp.json` → **Deploy to Make (beta)** → pick the origin. Confirm
   each new component when asked; the extension then writes `idMapping` into the origin.
   Commit that change.

To change the app later, edit these files and deploy again. Changes made in Make's web
editor come back with **Pull All Components from Make (beta)** on the same file.

## Test a scenario

Use a Vink Organisation with a Form and an API Key (Settings → API Keys).

1. New scenario → Vink → **Watch approved Documents**. Add a connection with the API Key;
   a wrong key must show Vink's message ("This API Key doesn't exist or was revoked.").
2. Add a webhook, pick the Form. In Vink, Settings → Integrations shows a new Webhook named
   after the API Key, attached to that Form.
3. Before any run, the mapping panel shows the Form's Fields under `data` (a List Field as an
   array with its sub-Fields), and the sample comes from the sample endpoint.
4. Run once, approve a Document of that Form in Vink: one bundle arrives with every Field.
   A test-send from Vink arrives too, with `test: true`.
5. Delete the webhook in Make: the Webhook in Vink is gone.
6. Second scenario → **Send in a Document**: e.g. an HTTP "Get a file" of a PDF, then this
   module with a Form. The Document shows in Vink with the API Key's name as its source.
   Send a PNG, a 21-page PDF, and use an organisation without Pages: each fails with Vink's
   message.
7. Check the gap below: delete the Subscription's Webhook in Vink first, then delete the
   webhook in Make.

Known gap: detach answers 404 when the Subscription is already gone (an Admin deleted the
Webhook, or the API Key was revoked). Make treats every 4xx as an error and can't mark it
as success, so Make shows "There's no Subscription with that id in your Organisation." Check
in step 7 whether Make still removes its webhook.

## Submit for review

Before the request (see Make's "App review" prerequisites):

- Test scenarios for both modules, shared with Make's QA, with a test API Key that has Pages.
- Make's docs say every app with an API should have a universal module ("Make an API
  call", relative URL on the base). It is not built yet; add it if the review asks.
- Module labels and descriptions follow Make's naming rules; check them in the review.

Then, in Make: Custom Apps → Vink → Request review. Once Make approves the app, it is public
and `lib/platforms.ts` can list Make as `native`. Until then the site keeps "Make, via
webhook".
