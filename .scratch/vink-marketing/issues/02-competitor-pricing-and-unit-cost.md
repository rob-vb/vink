# Competitor pricing and our cost per page

Type: research
Status: resolved
Blocked by: 

## Question

How do comparable document-extraction products price self-serve plans — Reducto, Docsumo, Nanonets, Mindee, Parseur, Rossum, Klippa, Affinda, and similar — by credits, pages, documents or seats; free tiers and trials; overage; what counts as a unit (page vs document); annual discounts; and what sits behind "contact sales"? And what does one page or Document cost Vink today (model, Jev, R2, Convex), based on the API pipeline benchmark in `.scratch/vink-v1/` and current list prices? Output: a comparison table, Vink's unit cost range, and the margin implications for a few candidate price points.

## Answer

Competitors meter by the page and fall into two groups. Developer APIs publish $0.01–0.06/page (Reducto Extract $0.020, LlamaExtract agentic $0.031, Mindee $0.047–0.06, Extend $0.0625). Apps with a review UI charge more per page or hide the price behind sales: Parseur €49 for 100 pages, falling to €0.13/page at 1k and €0.05 at 10k; Docparser $39 for 100 documents of up to 5 pages; Rossum from $18k/year; Docsumo, Affinda and Klippa quote only. Free offers are either a one-off credit (Reducto $150, Nanonets $50, Affinda 200 pages) or a small monthly tier (Parseur 20 pages). Annual discounts are 10–20%. "Contact sales" hides data residency, ZDR, SSO, SLAs and volume discounts. Prices read on 2026-09-29.

Vink's cost per page:
- Read is Gemini 3.8 Flash on Vertex EU (10% above global); its price doubles on 2027-01-01.
- Now about **$0.017/page** ($0.037 per average fixture Document); from 2027 about **$0.032/page**. Jev, Convex and R2 barely count.
- Plan with **$0.02/page now, $0.035/page from 2027**. Based on 5 fixture documents; not yet checked against a Vertex bill.

Implications:
- ≥70% margin at 2027 cost needs about **€0.07–0.10/page** (e.g. €49/500 pages keeps 65% at full use, 78% at 60% use; €149/2,000 keeps 55%/72%). Cheaper plans (€29/500, €99/2,000) only work while Gemini's introductory price lasts.
- Meter by page, or define a "document" as up to N pages — cost grows with pages.
- A free tier costs at most ~$3.20 per Organisation; its size is an abuse question, not a cost one.
- Price on the 2027 cost now, so early customers don't need repricing.

Findings: branch `research/competitor-pricing-and-unit-cost`, file `.scratch/vink-marketing/research/competitor-pricing-and-unit-cost.md`.
