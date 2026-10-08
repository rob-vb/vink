"use node";
// The email split (ADR 0010): Jev decides whether one email is one Document
// (its text and attachments together) or several (one per part). Jev decides
// here, as in the Router; the vision model never sees the email for this. It is
// told the subject, the text and the list of attachments, not their contents.
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { models } from "./models";
import type { Splitter } from "./pipeline";
import { usage } from "./usage";

// Enough of the text to tell a complaint from a cover note; the rest costs tokens.
const MAX_BODY_CHARS = 4000;

export const splitter: Splitter = {
  async split(mail) {
    const result = await new TypeSafeClient().systemOne({
      model: models.jev,
      state: { mail: { ...mail, body: mail.body.slice(0, MAX_BODY_CHARS) } },
      questions: {
        parts: choice(
          "`mail` is one email: its subject, its text in `body` (may be empty) and its attachments. Does the text with its attachments describe one case that belongs on one form (e.g. a complaint with a photo of the damage, a letter with its annex, one invoice sent as several files), or is each attachment a separate paper that stands on its own (e.g. several invoices, orders or scans sent in one go, with the text at most a cover note)?",
          {
            together: "One case: the text and the attachments belong together",
            apart: "Separate papers: each attachment stands on its own",
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
      answer: answer.choice === "together" ? "together" : "apart",
      probability: answer.probabilities[answer.choice],
    };
  },
};
