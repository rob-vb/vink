"use node";
// The email split (ADR 0010): Jev decides whether one email is one Document
// (its text and attachments together) or several (one per part). Jev decides
// here, as in the Router; the vision model never sees the email for this. It is
// told the subject, the text and the list of attachments, not their contents.
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { COVER_NOTE_MAX_CHARS } from "./mailPlan";
import { models } from "./models";
import type { Splitter } from "./pipeline";
import { usage } from "./usage";

// Enough of the text to tell a complaint from a cover note; the rest costs tokens.
// Jev's `cover_note` only counts for a text this short (planMail), so the part Jev
// never sees can't be dropped with it.
const MAX_BODY_CHARS = COVER_NOTE_MAX_CHARS;

export const splitter: Splitter = {
  async split(mail) {
    const result = await new TypeSafeClient().systemOne({
      model: models.jev,
      state: { mail: { ...mail, body: mail.body.slice(0, MAX_BODY_CHARS) } },
      questions: {
        parts: choice(
          "`mail` is one email: its subject, its text in `body` (may be empty) and its attachments. Does the text with its attachments describe one case that belongs on one form (e.g. a complaint with a photo of the damage, a letter with its annex, one invoice sent as several files)? Or is each attachment a separate paper that stands on its own (e.g. several invoices, orders or scans sent in one go), and then is the text only a cover note (a greeting, 'see attachment', 'please process') or a paper of its own (e.g. a complaint, an order or a question that happens to come with other papers)?",
          {
            together: "One case: the text and the attachments belong together",
            cover_note: "Separate papers: each attachment stands on its own, and the text is only a cover note that holds nothing to read or process",
            apart: "Separate papers: each attachment stands on its own, and the text is a paper of its own",
          },
        ),
      },
    });
    usage.record({
      model: result.model,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    });
    const answer = result.answers.parts;
    return {
      answer: answer.choice === "together" || answer.choice === "cover_note" ? answer.choice : "apart",
      probability: answer.probabilities[answer.choice],
    };
  },
};
