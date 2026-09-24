# 36 — New Form from a sample PDF

Type: task
Status: ready-for-agent
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

- [ ] The Admin can choose "from a sample PDF" or "blank", and sees progress that survives leaving the page
- [ ] Every piece of data is listed with the ticked flag, and no proposed Field is required
- [ ] Ticked Fields open in the Form editor and save as the first Form Version
- [ ] With the option on, the sample becomes the Form's first Document without a second Read
- [ ] With the option off, the PDF and Reading are deleted at once
- [ ] A failure shows Retry and "Start blank"
- [ ] `convex-test` with a stubbed proposal covers the Form Version, both sample paths and the Admin-only access
