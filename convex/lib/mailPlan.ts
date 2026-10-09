// How one email becomes Submissions (ADR 0010): the pure part of the email
// intake. Jev's call (lib/splitter.ts) comes in as `decision`; this turns it
// into the Submissions to create, and whether a user must look at them.
import { type CountedInput, itemCountOf } from "./inputLimits";
import type { SplitInfo } from "./eventInfo";

/** An attachment that passed the checks: a PDF or an image, stored under `key`. */
export type MailPart = {
  filename: string;
  mimeType: string;
  key: string;
  kind: "pdf" | "image";
  /** A PDF's pages; 1 for an image. */
  pageCount: number;
};

/**
 * Jev reads this many characters of the text (lib/splitter.ts). A longer text
 * can hold more than a cover note in the part Jev never saw, so it is never
 * dropped as one.
 */
export const COVER_NOTE_MAX_CHARS = 4000;

/** Below this, Jev's call is not trusted: Vink splits and marks Needs Review. */
export const SPLIT_CONFIDENCE = 0.8;

export type PlannedSubmission =
  /** The email text, with `attachments` as parts of the same Submission (none when it stands alone). */
  | { kind: "email"; parts: MailPart[] }
  | { kind: "pdf" | "image"; part: MailPart };

/**
 * Jev's call on the parts of one email (lib/splitter.ts):
 *   together   = one case: the text and the attachments are one Submission
 *   cover_note = separate papers, and the text is only a cover note ("see
 *                attachment, regards"): each attachment is a Submission, the text is
 *                no Submission and costs nothing
 *   apart      = separate papers, and the text is a paper of its own (a complaint,
 *                an order): the text is a Submission too
 */
export type SplitAnswer = "together" | "cover_note" | "apart";

export type SplitDecision = { answer: SplitAnswer; probability: number };

export type MailPlan = {
  submissions: PlannedSubmission[];
  /** The text was dropped as a cover note: not a Submission, not charged. Only set when Jev was sure. */
  coverNote: boolean;
  /** Set when Vink was unsure: every Submission gets this reason and waits for a user. */
  unsure: SplitInfo | null;
};

function counted(part: MailPart): CountedInput & { kind: "pdf" | "image" } {
  return part.kind === "pdf" ? { kind: "pdf", pageCount: part.pageCount } : { kind: "image" };
}

/** The Items of the whole email under this plan: what the Submissions must add up to, and what is charged. */
export function itemsOfMail(body: string, parts: MailPart[], plan: MailPlan): number {
  return itemCountOf({ kind: "email", body: plan.coverNote ? "" : body, attachments: parts.map(counted) });
}

/** The Items of one planned Submission; the plan's total is their sum. */
export function itemsOfPlanned(planned: PlannedSubmission, body: string): number {
  if (planned.kind === "email") {
    return itemCountOf({ kind: "email", body, attachments: planned.parts.map(counted) });
  }
  return itemCountOf(counted(planned.part));
}

/**
 * The Submissions of one email.
 *   - nothing to process: none
 *   - one part (the text with content, or one attachment): one Submission, no call to Jev
 *   - more parts: Jev's answer, `together` = one email Submission with all parts,
 *     `cover_note` = each attachment as a Submission of its own and the text
 *     dropped (no Submission, no Items), `apart` = the text (if it has content)
 *     as an email Submission and each attachment as a Submission of its own.
 *     A `cover_note` for a text over COVER_NOTE_MAX_CHARS counts as `apart`.
 * When Jev's probability is under SPLIT_CONFIDENCE, any answer is treated as
 * unsure: split, the text as its own Submission (never dropped on a doubtful
 * call), and mark every Submission Needs Review.
 * However it is split, the Items of the Submissions add up to itemsOfMail.
 */
export function planMail(body: string, parts: MailPart[], decision: SplitDecision | null): MailPlan {
  const hasBody = body.trim() !== "";
  if (!hasBody && parts.length === 0) return { submissions: [], coverNote: false, unsure: null };
  if (!hasBody && parts.length === 1) {
    return { submissions: [{ kind: parts[0].kind, part: parts[0] }], coverNote: false, unsure: null };
  }
  if (parts.length === 0) return { submissions: [{ kind: "email", parts: [] }], coverNote: false, unsure: null };
  if (decision === null) throw new Error("An email with several parts needs Jev's call");

  const sure = decision.probability >= SPLIT_CONFIDENCE;
  if (decision.answer === "together" && sure) {
    return { submissions: [{ kind: "email", parts }], coverNote: false, unsure: null };
  }
  // A text Jev saw only the start of is never dropped: it is a paper of its own (`apart`).
  if (decision.answer === "cover_note" && sure && body.trim().length <= COVER_NOTE_MAX_CHARS) {
    return { submissions: parts.map((part): PlannedSubmission => ({ kind: part.kind, part })), coverNote: hasBody, unsure: null };
  }
  const submissions: PlannedSubmission[] = [
    ...(hasBody ? [{ kind: "email" as const, parts: [] }] : []),
    ...parts.map((part): PlannedSubmission => ({ kind: part.kind, part })),
  ];
  return {
    submissions,
    coverNote: false,
    unsure: sure
      ? null
      : { answer: decision.answer, percent: Math.round(decision.probability * 100), submissions: submissions.length },
  };
}

/** Whether Jev has anything to decide: the email has more than one part. */
export function needsSplitCall(body: string, parts: MailPart[]) {
  return parts.length + (body.trim() === "" ? 0 : 1) > 1;
}
