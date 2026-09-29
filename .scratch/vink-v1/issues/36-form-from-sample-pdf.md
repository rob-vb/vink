# 36 — New Form from a sample PDF

Type: task
Status: resolved
Blocked by: 21, 24, 27

## What to build

On "New Form" an Admin chooses "from a sample PDF" or "blank". With a sample, a **Form Proposal** is created and Read runs in the background exactly as in an Extraction. The Admin sees progress and can leave and come back. Then one vision-model call (configuration) gets the Reading plus the page images and text layer, and returns the proposed Fields:
- a label as printed, an English camelCase key, and an English description with the printed terms as synonyms;
- a type that follows the content, with choice only when the options are printed;
- required always off;
- a ticked flag for useful Fields. Every piece of data is listed, and things like bank details are left unticked.

The Admin unticks, edits the ticked Fields in the normal Form editor and saves the first Form Version. "Also process this sample as a Document" (on by default) then runs Match, Fill and Verify on the stored Reading. When it's off, the sample's PDF and Reading are deleted at once. A failed proposal shows a clear error with Retry or "Start blank". Only an Admin can create a Form Proposal.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for AI-generated suggestions to review, select and edit, plus background progress states. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] The Admin can choose "from a sample PDF" or "blank", and sees progress that survives leaving the page
- [x] Every piece of data is listed with the ticked flag, and no proposed Field is required
- [x] Ticked Fields open in the Form editor and save as the first Form Version
- [x] With the option on, the sample becomes the Form's first Document without a second Read
- [x] With the option off, the PDF and Reading are deleted at once
- [x] A failure shows Retry and "Start blank"
- [x] `convex-test` with a stubbed proposal covers the Form Version, both sample paths and the Admin-only access

## Comments

- 2026-09-24 — Built on branch `ticket-36-form-proposal` (stacked on `ticket-32-auto-send`). A new `formProposals` table holds the sample's key, filename and page count, its state (`reading` → `proposing` → `ready`, or `failed` with the error), its Reading and text layer, and the proposed Fields with `ticked`. `formProposals.create` (Admin action) checks the upload with the same `checkUpload` as Documents (this Organisation, arrived, a PDF, at most 20 pages) and queues `proposalRun.run` on the same Workpool as Extractions (bounded concurrency, 4 attempts, `onComplete` sets `failed`). The run reuses the Reader and saves the Reading (a retry skips it), then makes one Proposer call (`lib/proposer.ts`: Claude on Vertex with the PDF, text layer and Reading, the ticket-14 rules in the prompt, the model pinned as `PROPOSER_MODEL`, default `claude-opus-5`). The adapter drops invalid keys and keeps `choice` only with printed options. `saveFields` forces `required: false` on every Field and sub-Field.
- `formProposals.save` (Admin) creates the Form and Version 1 from the Fields the Admin kept and edited (`forms.insertForm`, shared with `forms.create`). With `processSample` it creates the first Document through the new `documents.createDocument` helper, with the Reading and text layer copied in, so the Extraction starts at Match. Without it, the sample PDF is removed from R2 and the proposal (with its Reading) is deleted. `retry`, `discard` and `list` (open proposals) complete the API, all Admin-only.
- UI: "New Form" now offers "From a sample PDF" (drop zone, `sample-upload.tsx`) or "Blank" (`?blank=1` jumps straight to the editor, used by "Start blank"). `/forms/proposals/<id>` shows live progress (Reading → Proposing, "you can leave this page"), a failure Alert with Retry and Start blank, then every proposed Field as a checkbox row (label, key, type, description, options or sub-Fields) with a sticky "N of M Fields kept" bar and Discard / "Continue to the Form editor". The editor gets the "Also process this sample as a Document" checkbox (on by default) and saves through `formProposals.save`. The Forms page lists open proposals with their state and the 7-day note. Mobbin references: [AirOps "Review your initial prompts"](https://mobbin.com/screens/b8ee990e-2ada-41b0-9e96-4018c045aebd) (AI output as an editable list before continuing), [Klaviyo starter guide](https://mobbin.com/screens/7732bee9-ec53-4183-9d93-4f52ff49043a) (checkbox rows) and [Magnific model picker](https://mobbin.com/screens/20f7ca1a-83d3-4a7b-85c4-278d0c2d0a88) (a sticky "N selected · Save" bar).
- Tests: `convex/formProposals.test.ts` with a stubbed Proposer (`fakeProposer` replays `Recording.proposal`) covers the background run (Read then Propose, ticked flags, required forced off, listed while running), saving as Version 1 with the sample becoming the first Document without a second Read, deleting the PDF and proposal when the sample isn't processed, a failure with Retry that skips Read, Discard, the 20-page limit, Admin-only access and tenancy.
- Checked in headless Chrome against dev on a proposal seeded through the internal mutations (a real upload needs R2): the chooser, the Forms-page entry, unticking (3 of 6 kept, with the IBAN and phone left unticked by the "model"), the editor with the checkbox, and "Create Form" all worked. The Form and its first Document were created.
- **Open real-service checks:** the real Proposer hasn't run (no Vertex credentials). At the end-of-v1 run, try it on the 5 fixtures (the ticket-14 plan) and check labels, keys, types, `choice` only for printed options, and the ticks. A real sample upload also needs R2.
