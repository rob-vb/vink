# 22 — Upload a PDF and see it in the Document list

Type: task
Status: ready-for-agent
Blocked by: 20

## What to build

A Member uploads a PDF and chooses the Form it belongs to. The PDF is stored in Cloudflare R2 with EU jurisdiction via `@convex-dev/r2`. The **Document** records the current Form Version, filename, page count, uploader and upload time, and is created as `extracting`. Uploads over 20 pages are refused with a clear message. The Document list has tabs by state with counts (Extracting, Needs Review, Approved, Failed), and status updates arrive live through Convex subscriptions without a refresh. The PDF can be viewed only through a short-lived signed URL, issued after a Membership check. The Extraction itself comes in ticket 23. Until then a Document just sits in Extracting.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for upload (with the Form picker) and the Document list with its state tabs. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] A Member can upload a PDF against a Form. The Document records the Form Version current at upload time and starts as `extracting`
- [ ] A PDF over 20 pages is refused with a clear message, and nothing is stored
- [ ] The Document list shows tabs by state with counts that update live
- [ ] The PDF opens through a short-lived signed URL, and a user without a Membership in that Organisation gets no URL
- [ ] History records "uploaded" with who and when
- [ ] `convex-test` with a faked R2 covers the page cap, the tenancy check on signed URLs and the initial state
