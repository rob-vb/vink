# 41 — Clef instead of Jev

Type: research
Status: resolved

## Question

Cloudflare released Clef on Workers AI (2026-10-01): a System One decision model like Jev, but one that can also see up to 4 images. Can it replace Gemini and Jev, or Jev alone, and does seeing the pages make Match or Verify better?

## Answer

No, not in the current pipeline. Spike code is on branch `spike/clef-vision` (not merged): `convex/lib/systemOne.ts` sends the same questions to Jev or Clef, and `npm run eval` takes `JEV_MODEL=clef|clef-flash`, `--match-images` and `--verify-images`. Only Clef Flash (9B) was run; Clef (27B) was not.

- **Replace Gemini:** impossible. Clef only answers `noul`, `choice` and `score` questions; it can't write a Reading or a value.
- **Match:** on the stored Readings, Clef Flash scored 83/84 values and 4/4 Lists against Jev's 82/84 and 4/4, a one-value difference in one run. It took 1–15 s per Document against Jev's 0.4–1.4 s.
- **Verify, fit:** Clef Flash's fit is flat (0.45–0.65 for most values, right or wrong; Jev 0.85–0.98), so nearly every value became Needs Review (precision 1%).
- **Verify, support from page images:** a question's probability falls with its position in the request. On `tire-service-004`, support for right values fell from 0.96 to 0.07 in question order; reversing the order moved the drop. Asked one question per request, right values scored 0.94–0.97, and several wrong values were caught (a plate one character off 0.06, an impossible date 0.14), but swapped digits (`9989` for `9899`, 0.95) and another Field's value (0.68–0.85) were not.
- **Images:** Workers AI estimates an image by its base64 text (4 characters a token) and refuses a request whose estimate passes Clef's 64k window, although it bills about 1,100 tokens for a 100 dpi page. So a request with images holds only the values to check, not the Reading, with pages rendered grey at 100 dpi under 150 KB.
- **Handwriting router** (pick Read's thinking level per Document): on the 11 real fixture pages, "does this page contain any handwriting" scored 0.93–0.94 for handwritten pages and 0.01–0.02 for the rest. On 14 test pages with handwriting pasted onto printed pages, it scored a printed stamp 0.05 and a scanned page with a small handwritten note 0.06: too thin a margin. "Does it hold handwritten values" missed 6 of 9. The text layer does this for free: [Read thinking level by text layer](40-read-thinking-by-text-layer.md).
- **Cost:** Clef $0.24 and Clef Flash $0.09 per million input tokens, against Jev's $0.042. On the fixtures Jev's Match and Verify read 307k tokens for 11 pages: about $0.0067 per page on Clef, $0.0025 on Clef Flash, $0.0012 on Jev. Workers AI's free 10,000 Neurons a day cover about 460k Clef or 1.2M Clef Flash tokens.
