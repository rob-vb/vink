# Vink for Make

The Vink custom app for [Make](https://www.make.com), kept as the local files of Make's
VS Code extension ("Make Apps Editor", local development). `src/makecomapp.json` lists every
component and the file of each code; the other files in `src/` are those codes.

| Component | Local id | What it does |
| --- | --- | --- |
| Base | `general/base.iml.json` | `https://vink.page/v1`, `Authorization: Bearer <API Key>`, errors show `[status] message (error code: code)` from Vink's error body |
| Connection | `vink` | Asks for an API key, checks it with `GET /v1/forms` |
| Webhook (dedicated, attached) | `approvedDocuments` | Form dropdown; attach = `POST /v1/subscriptions`, detach = `DELETE /v1/subscriptions/{id}` |
| Instant trigger | `watchApprovedDocuments` | "Watch approved Documents": outputs the envelope; `data` is built from the Form's Fields |
| Action | `sendDocument` | "Send in a Document": Form dropdown, a file (name + data) sent as the multipart `file` part |
| Universal module | `makeApiCall` | "Make an API call": any path on Base, with the connection's API Key |
| RPC | `listForms` | The Form dropdown (`GET /v1/forms`), at most 500 Forms |
| RPC | `formFields` | The trigger's `data` collection: `formFieldsSpec(body.data, webhook.formId)` |
| RPC | `formSample` | The trigger's sample (`GET /v1/forms/{form_id}/sample`) |
| Custom IML function | `formFieldsSpec` | Turns a Form's Fields into Make output fields; a List Field becomes an array of collections |

The Form is a parameter of the webhook, because attach needs it. Attach keeps the
Subscription's id as `externalHookId` (Make's usual name for the remote hook) and `formId` in
the webhook's data; detach reads `webhook.externalHookId`, the two trigger RPCs read
`webhook.formId`.

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

The app lives in Make (zone EU1) as `vink-fsvhks`, version 1. `origins[0]` in
`src/makecomapp.json` points at it, and its `idMapping` pairs each local component with its
name in Make (Make named the connection and the webhook `vink-fsvhks`).

### Headless, from the shell

1. Put a Make API token in `integrations/make/.secrets/apikey` (one line; the `.gitignore` here
   keeps it out of git). Make it under Profile → API access, zone EU1, with the scopes
   `sdk-apps:read` and `sdk-apps:write`.
2. See the plan. This only reads from Make:

   ```sh
   npx tsx integrations/make/deploy.mts --dry-run
   ```

3. Deploy:

   ```sh
   npx tsx integrations/make/deploy.mts
   ```

   The script uses Make's SDK Apps API (`/api/v2/sdk/apps/...`). It creates each component
   that is not in Make yet and writes its name into `idMapping` (commit that change). Then it
   sets labels and references, and uploads each code whose content differs from Make's.
   A second run sends nothing. The last line counts what it did; the exit code is 1 when a
   step failed.

`--origin <label>` picks another origin from `makecomapp.json` (for example a second app for
tests). A new app: create it in Make (Custom Apps → Create app; label "Vink", theme
`#0f1e36`), add an origin with its app ID and no `idMapping`, and run the script.

Custom IML functions are on for `vink-fsvhks` (Make support, 2026-10-07). Make refuses a
function code that does not start with `function` (`HTTP 400 Invalid function code. (IM005)`),
so the eslint comment in `form-fields-spec.code.js` sits on the function line itself.

The app icon is not part of these files. Upload `public/vink_icon.svg` as a 512×512 PNG in
Make (Custom Apps → Vink → the icon).

### Alternative: VS Code

The files are the local format of the "Make Apps Editor" VS Code extension, and the script
writes the same `idMapping`. So the extension can deploy them too: open `integrations/make`
as the workspace folder, right-click `src/makecomapp.json` → **Deploy to Make (beta)**, pick
the origin. Changes made in Make's web editor come back with **Pull All Components from Make
(beta)** on the same file; the script does not pull.

## Test a scenario

Use a Vink Organisation with a Form and an API Key (Organisation settings → API Keys).

1. New scenario → Vink → **Watch approved Documents**. Add a connection with the API Key;
   a wrong key must show Vink's message with status and code ("[401] This API Key doesn't
   exist or was revoked. (error code: invalid_api_key)").
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
7. Delete the Subscription's Webhook in Vink first, then delete the webhook in Make: Make
   removes it without an error.

Detach of a Subscription that is gone already (an Admin deleted its Webhook, or its URL
answered 410) still answers 200: `DELETE /v1/subscriptions/{id}` is idempotent, because Make
treats every 4xx as an error. Known gap: after the API Key is revoked, detach gets 401 (the
key no longer works) and Make shows "[401] This API Key doesn't exist or was revoked.
(error code: invalid_api_key)". The
Subscription ended with the key, so delete the webhook in Make anyway.

## Submit for review

Before the request (see Make's "App review" prerequisites):

- Test scenarios for both modules, plus one scenario that ends in an API error, shared with
  Make's QA, with a test API Key that has Pages. The review form asks for their links.
- The universal module `makeApiCall` ("Make an API call", a path relative to Base) is there,
  as Make requires.
- Every module is set to visible in Make. From the shell (Make's SDK Apps API; a read right
  after can still show the old value):
  `curl -X POST -H "Authorization: Token $(cat integrations/make/.secrets/apikey)" https://eu1.make.com/api/v2/sdk/apps/vink-fsvhks/1/modules/<module>/public`
- Module labels and descriptions follow Make's naming rules; check them in the review.

Then, in Make: Custom Apps → Vink → Request review. Once Make approves the app, it is public
and `lib/platforms.ts` can list Make as `native`. Until then the site keeps "Make, via
webhook".
