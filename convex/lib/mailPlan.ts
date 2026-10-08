// How one email becomes Documents (ADR 0010): the pure part of the email
// intake. Jev's call (lib/splitter.ts) comes in as `decision`; this turns it
// into the Documents to create, and whether a user must look at them.
import { type CountedInput, itemCountOf } from "./inputLimits";

/** An attachment that passed the checks: a PDF or an image, stored under `key`. */
export type MailPart = {
  filename: string;
  mimeType: string;
  key: string;
  kind: "pdf" | "image";
  /** A PDF's pages; 1 for an image. */
  pageCount: number;
};

/** Below this, Jev's call is not trusted: Vink splits and marks Needs Review. */
export const SPLIT_CONFIDENCE = 0.8;

export type PlannedDocument =
  /** The email text, with `attachments` as parts of the same Document (none when it stands alone). */
  | { kind: "email"; parts: MailPart[] }
  | { kind: "pdf" | "image"; part: MailPart };

export type MailPlan = {
  documents: PlannedDocument[];
  /** Set when Vink was unsure: every Document gets this reason and waits for a user. */
  unsure: string | null;
};

function counted(part: MailPart): CountedInput & { kind: "pdf" | "image" } {
  return part.kind === "pdf" ? { kind: "pdf", pageCount: part.pageCount } : { kind: "image" };
}

/** The Items of one planned Document; the plan's total is their sum. */
export function itemsOfPlanned(planned: PlannedDocument, body: string): number {
  if (planned.kind === "email") {
    return itemCountOf({ kind: "email", body, attachments: planned.parts.map(counted) });
  }
  return itemCountOf(counted(planned.part));
}

/**
 * The Documents of one email.
 *   - nothing to process: none
 *   - one part (the text with content, or one attachment): one Document, no call to Jev
 *   - more parts: Jev's answer, `together` = one email Document with all parts,
 *     `apart` = the text (if it has content) as an email Document and each
 *     attachment as a Document of its own.
 * When Jev's probability is under SPLIT_CONFIDENCE, either answer is
 * treated as unsure: split, and mark every Document Needs Review.
 * However it is split, the Items of the Documents add up to itemCountOf of the
 * whole email.
 */
export function planMail(
  body: string,
  parts: MailPart[],
  decision: { answer: "together" | "apart"; probability: number } | null,
): MailPlan {
  const hasBody = body.trim() !== "";
  if (!hasBody && parts.length === 0) return { documents: [], unsure: null };
  if (!hasBody && parts.length === 1) {
    return { documents: [{ kind: parts[0].kind, part: parts[0] }], unsure: null };
  }
  if (parts.length === 0) return { documents: [{ kind: "email", parts: [] }], unsure: null };
  if (decision === null) throw new Error("An email with several parts needs Jev's call");

  const sure = decision.probability >= SPLIT_CONFIDENCE;
  if (decision.answer === "together" && sure) {
    return { documents: [{ kind: "email", parts }], unsure: null };
  }
  const documents: PlannedDocument[] = [
    ...(hasBody ? [{ kind: "email" as const, parts: [] }] : []),
    ...parts.map((part): PlannedDocument => ({ kind: part.kind, part })),
  ];
  return {
    documents,
    unsure: sure
      ? null
      : `Vink was not sure whether this email is one case or ${documents.length} separate papers (${Math.round(decision.probability * 100)}% sure of "${decision.answer === "together" ? "one case" : "separate"}"), so it made ${documents.length} Documents. Check whether they belong together.`,
  };
}

/** Whether Jev has anything to decide: the email has more than one part. */
export function needsSplitCall(body: string, parts: MailPart[]) {
  return parts.length + (body.trim() === "" ? 0 : 1) > 1;
}
