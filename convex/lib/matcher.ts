"use node";
// Match (ADR 0003): Jev picks, per top-level Field, the leaf of the Reading
// that holds it, or `none`. The whole Reading is Jev's state.
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { models } from "./models";
import type { FlatField, Matcher } from "./pipeline";
import { type Leaf, readingLeaves } from "./reading";

// Jev takes at most this many criteria per Choice, `none` included.
const MAX_CRITERIA = 255;

/** Whether a leaf could hold a value of the Field's type at all. */
function couldHold(field: FlatField, leaf: Leaf) {
  if (field.type === "number") return /\d/.test(leaf.text);
  if (field.type === "date") return /\d{1,4}[/.\-\s]\S+[/.\-\s]\d{2,4}/.test(leaf.text);
  return true;
}

function question(field: FlatField, leaves: Leaf[]) {
  const criteria: Record<string, string> = { none: "Nothing in the Reading holds this" };
  leaves.forEach((leaf, i) => {
    if (couldHold(field, leaf) && Object.keys(criteria).length < MAX_CRITERIA) {
      criteria[`v${i}`] = `\`${leaf.path}\` = ${JSON.stringify(leaf.text)}`;
    }
  });
  const about = [field.label, field.description].filter(Boolean).join(": ");
  return choice(
    `Which value in \`document\` is the Field "${field.key}" (${field.type}) of this Form: ${about}?`,
    criteria,
  );
}

export const matcher: Matcher = {
  async match(reading, fields) {
    if (fields.length === 0) return {};
    const leaves = readingLeaves(reading);
    const { answers } = await new TypeSafeClient().systemOne({
      model: models.jev,
      state: { document: reading },
      questions: Object.fromEntries(fields.map((f) => [f.key, question(f, leaves)])),
    });
    return Object.fromEntries(
      fields.map((field) => {
        const answer = answers[field.key];
        const picked = answer.choice === "none" ? null : leaves[Number(answer.choice.slice(1))];
        return [
          field.key,
          { path: picked?.path ?? null, probability: answer.probabilities[answer.choice] },
        ];
      }),
    );
  },
};
