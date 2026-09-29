# Firecrawl as a PDF extraction route

Type: research
Status: resolved
Blocked by: 

## Question

Can Firecrawl (https://www.firecrawl.dev/glossary/web-scraping-apis/best-way-scrape-parse-pdfs-web) do our PDF extraction, or part of it? Find out:
- whether it accepts uploaded PDF files (not only URLs; our PDFs sit privately in R2);
- whether it reads scans and Dutch handwriting, and which OCR or model it uses underneath;
- whether it does schema-based JSON extraction (its extract/JSON mode) with per-field confidence or source pages;
- page limits, cost per page, latency and rate limits;
- data processing: EU region, subprocessors, retention, DPA and zero-retention options;
- its TypeScript SDK.

Compare it with the design in [Extraction pipeline design](08-extraction-pipeline.md): one vision model on Vertex EU, with Jev verification. Is Firecrawl a candidate for [API pipeline benchmark](11-api-pipeline-benchmark.md), a possible pre-processing step (markdown from the text layer), or not a fit? Firecrawl is built for scraping the public web, so the key test is private files plus handwriting plus EU.

## Answer

The user ruled out hosted Firecrawl on cost (2026-09-23): Gemini 3.8 Flash on Vertex EU is cheaper per Document. So it's not a candidate for the API pipeline benchmark either. The docs back that up with blockers of their own. It does accept private file uploads (`/v2/parse`) and it has schema-based JSON extraction. But its servers are in the US with no EU region, and ZDR and a DPA are Enterprise-only. It reads scans with GLM-OCR, which doesn't list Dutch or claim any handwriting support. Its JSON extraction runs an unnamed LLM over that OCR markdown, without the page image, and returns no per-field confidence or source pages. As a pre-processing step it adds nothing we can't run locally. What is useful is Firecrawl's open-source **pdf-inspector**, as the local triage and text-layer step.

- **Upload:** multipart `file`, max 50 MB, `mode` auto/fast/ocr, `maxPages`. No public URL needed. TypeScript SDK `firecrawl` with `firecrawl.parse()`, Zod schemas supported.
- **Handwriting/OCR:** scanned regions go through GLM-OCR (0.9B). Its model card lists zh/en/fr/es/ru/de/ja/ko and makes no handwriting claim. Firecrawl documents neither languages nor handwriting.
- **JSON:** `formats: [{type: "json", schema}]`, but it runs on markdown only, and the LLM isn't named in the docs or subprocessors. Confidence is only per layout block (`blocks[].confidence`), not per Field. Firecrawl itself warns that schemas over 30 fields are unreliable and that `minItems` makes the model invent entries.
- **Data:** privacy policy says data is stored in the US and gives no SCCs. Subprocessors are GCP, Supabase, Vercel and WorkOS, with no LLM listed. Default retention for uploads is undocumented. `zeroDataRetention` is Enterprise-only at +1 credit/page.
- **Price:** 1 credit/page to parse, +4/page for JSON. That's about $0.021 for a 5-page Document on the Standard plan ($83 per 100k credits), against about $0.004 for Gemini 3.8 Flash on Vertex EU, which also reads the page images directly. `/parse` rate limits are undocumented. The "under 400 ms per page" figure is a marketing claim.
- **pdf-inspector (MIT, local):** per-page classification with reason codes (`scanned`, `invisible_text_layer`, `suspected_garbled_text`, …), per-page markdown, and text items with coordinates. It classified all 5 fixtures correctly in 1–73 ms. It could replace the hand-rolled pdf.js check in ADR 0002.
  - **Highlighting and Jev:** on text-layer pages, fuzzy-matching the read text against the page's text items gives free highlight boxes and the exact nearby text for Jev's source-support Noul. Scanned and handwritten pages have no text items, so neither works there.
  - **Where it runs:** the Node package is a napi-rs native module (14 MB linux-x64 binary). Convex Node actions accept it as an `externalPackages` entry, but Convex doesn't document native-module support, so test it with one deploy. The fallbacks are the WASM build in the default runtime (which has no positioned text) or the VPS.
  - **Handwriting:** it doesn't detect handwriting. Handwritten scans come back as `Scanned`, and a handwritten image on a digital PDF comes back as `TextBased`, so the vision call still gets every page image.

Findings: branch `research/firecrawl-pdf-extraction`, file `.scratch/vink-v1/research/firecrawl-pdf-extraction.md`.
