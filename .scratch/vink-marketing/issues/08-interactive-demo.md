# Interactive demo

Type: prototype
Status: resolved
Blocked by: 07

## Question

How does the pre-recorded, clickable demo behave? Settle which three or four varied documents it shows (no tyre reports; e.g. an invoice, a handwritten form, a receipt, a delivery note), whether they come from real pipeline output, what a visitor can click (fields ↔ source on the page, confidence, Needs Review, the resulting Payload), where it lives (Home, Features, or both), and how it ends in the sign-up CTA.

Context from [Visual direction and homepage layout](07-visual-direction-and-homepage.md): on Home the demo sits at stop 2 of "What happens to one document", as document tabs with Fields next to the PDF, "Value is right" and Approve leading to the Payload. The prototype already has a rough version of this; the demo can grow from it.

## Answer

We picked the direction of variant C ("clear this morning's documents"), but shaped exactly like the app instead of an inbox: variant **D** in [Vink Demo Behaviours](https://claude.ai/artifact/HNgL3bnsfBJfNYfUtSfRqK). Prototype source: branch `prototype/interactive-demo`, `.scratch/vink-marketing/prototypes/` (variants A inline tabs, B guided walkthrough, C inbox kept there for reference).

**What it is:** a replica of the real app with demo data, in a "Demo data" app frame (Vink nav with Documents active). Two screens:
1. **Documents page**, exactly as the app: "Documents" heading, tabs Needs Review / Approved / Failed / Rejected with counts, and the table Document · Form vN · Pages · Uploaded by · Uploaded (Form, Pages and Uploaded by hidden on mobile, as in the app). **No demo-only additions** (no "N to check" badge).
2. **Review screen** on clicking a row, as the app: "← Documents", filename + state badge, "Form vN · N pages · Review Threshold 0.80", PDF pane with page n/N and zoom, Fields with "Read on page N", confidence to two decimals, Needs Review reasons, typing a correction, "Value is right", Undo, Approve once nothing is flagged.

**Behaviour:** clicking a value turns the PDF to the page it was read on (no region highlight). Approve returns to the table with a toast; the Document moves to Approved. Opening an approved Document shows "Approved" plus **"Sent to your system · Delivered" with the final values**, never JSON: the outcome is what matters, the webhook Payload lives only on the Developers page. When Needs Review is empty, a card shows the visitor's time, values checked and values read, then **Start free** (plus "Look around" and "Start over").

**Documents (five):** invoice (1 flagged), two-page delivery note (2 flagged, one on page 2), handwritten service request (1), faxed order form with a list (1), and a receipt already in Approved with the Auto-Send badge. No tyre reports.

**Data:** hand-written demo values and confidences (not pipeline output), static in the site code.

**Where:** the Features page ("Try it"); Home links to it ("Try the demo"). Home keeps its own lighter document tabs at stop 2 (Visual direction and homepage layout).

**Mobile:** same demo; table drops columns like the app, review screen stacks the page above the Fields. Fine as long as it works well there.

**Standing rule:** the demo mirrors the app. When the app's Documents table or review screen changes, the demo is updated in the same change.
