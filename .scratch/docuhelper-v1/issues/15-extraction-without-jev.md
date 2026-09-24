# Extraction without Jev

Type: grilling
Status: resolved
Blocked by: 

## Question

With [ADR 0003](../../../docs/adr/0003-reading-then-jev-matching.md), Jev matches the Reading to the Form, so Jev is on the critical path. Under ADR 0002 it was only a verifier that an Admin could switch off per Organisation (US subprocessor, GDPR), and Extraction still succeeded without it. Decide:
- **Jev down or failing after retries:** does the Extraction wait and retry, fail (Extraction Failed with manual retry), or fall back to another matcher, such as the vision or small model matching the Reading to the Form in one call?
- **Admin switches Jev off:** is that still allowed? If so, what matches the Reading, and what does that do to confidence (there's no Jev probability), Needs Review and Auto-Send (already unavailable without Jev, per [Confidence semantics and auto-send rules](09-confidence-and-auto-send.md))?
- Does a fallback matcher need its own benchmark on the fixtures before the spec?
- What goes to TypeSafe now: the Reading (the whole JSON, including names, plates and addresses) instead of short text per Field. Does that change the GDPR assessment in [Extraction pipeline design](08-extraction-pipeline.md)?

## Comments

**2026-09-24 (from Wrong Form or unusable Document):** Change Form re-runs Match and Fill on the stored Reading, and the "Does not fit this Form" flag is computed from the Match result. Whatever matches the Reading when Jev is down or switched off must also serve both of these.

**2026-09-24 (from Form proposal from a sample Document):** "Suggest Fields from PDF" on an existing Form uses Jev's Match to propose only Reading parts that no Field covers yet (`none`). If an Organisation can switch Jev off, fall back to proposing everything and let the Admin remove duplicates.

## Answer

Settled with the user on 2026-09-24. Recorded as consequences in [ADR 0003](../../../docs/adr/0003-reading-then-jev-matching.md). In `CONTEXT.md`, **Auto-Send** no longer mentions switching Jev off.

- **Jev is required in v1.** The Organisation setting "External verification (Jev)" from [Extraction pipeline design](08-extraction-pipeline.md) is dropped, and there is no fallback matcher. An Organisation that doesn't accept a US subprocessor is not a v1 customer. The switch can come back later together with a fallback matcher if customers ask for it.
- **No fallback benchmark** is needed, because no fallback matcher exists.
- **Jev fails during Match:** Workpool retries 3 times with backoff, as it does for Vertex. After that the Document gets **Extraction Failed** with a manual retry. The Reading is already stored, so a retry resumes at Match and doesn't read the PDF again. If Jev fails during Change Form or "Suggest Fields from PDF", the user sees an error with a retry. The earlier fallback of proposing every Field no longer applies.
- **Match succeeds but Verify fails:** the Extraction still succeeds, as under ADR 0002. Confidence is the minimum of the signals that are available (the Match probability). There is no Auto-Send, because Jev did not verify the Document.
- **GDPR:** TypeSafe stays a US subprocessor under the SCCs. The subprocessor description changes from "short text per Field" to "the structured Reading of the Document, never the PDF". The values are sent unmasked, because Match needs them to tell sources apart. Since there is no opt-out any more, the enterprise zero-retention quote and the transfer impact assessment are a **launch blocker**, not just something to do before the first paying customer.
