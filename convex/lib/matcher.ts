"use node";
// Match (ADR 0003): Jev picks, per top-level Field, the leaf of the Reading
// that holds it, and per List Field the array of objects that holds its
// entries, `none` included. A second request then picks, per sub-Field, the
// key inside the chosen array's elements. The whole Reading is Jev's state.
import { type ChoiceResponse, TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { MAX_CRITERIA } from "./matchPlan";
import { models } from "./models";
import type { FlatField, ListField, ListMatch, Match, Matcher, Reading } from "./pipeline";
import { type Leaf, type ReadingArray, readingArrays, readingLeaves } from "./reading";
import { usage } from "./usage";

const NONE = { none: "Nothing in the Reading holds this" };

/** Whether a leaf could hold a value of the Field's type at all. */
function couldHold(field: FlatField, leaf: Leaf) {
  if (field.type === "number") return /\d/.test(leaf.text);
  if (field.type === "date") return /\d{1,4}[/.\-\s]\S+[/.\-\s]\d{2,4}/.test(leaf.text);
  return true;
}

function about(field: { label: string; description?: string }) {
  return [field.label, field.description].filter(Boolean).join(": ");
}

function fieldQuestion(field: FlatField, leaves: Leaf[]) {
  const criteria: Record<string, string> = { ...NONE };
  leaves.forEach((leaf, i) => {
    if (couldHold(field, leaf) && Object.keys(criteria).length < MAX_CRITERIA) {
      criteria[`v${i}`] = `\`${leaf.path}\` = ${JSON.stringify(leaf.text)}`;
    }
  });
  return choice(
    `Which value in \`document\` is the Field "${field.key}" (${field.type}) of this Form: ${about(field)}?`,
    criteria,
  );
}

function listQuestion(list: ListField, arrays: ReadingArray[]) {
  const criteria: Record<string, string> = { ...NONE };
  arrays.slice(0, MAX_CRITERIA - 1).forEach((array, i) => {
    criteria[`a${i}`] =
      `array \`${array.path}\` (${array.length} elements, keys: ${array.keys.slice(0, 12).join(", ")})`;
  });
  return choice(
    `Which array in \`document\` holds the entries of the List Field "${list.key}" (${about(list)}), one element per entry?`,
    criteria,
  );
}

function keyQuestion(list: ListField, array: ReadingArray, field: FlatField) {
  const criteria: Record<string, string> = { ...NONE };
  array.keys.slice(0, MAX_CRITERIA - 1).forEach((key, i) => {
    criteria[`k${i}`] = `key \`${key}\``;
  });
  return choice(
    `Each element of \`document.${array.path}\` is one entry of "${list.key}". Which key inside those elements holds the sub-Field "${field.key}" (${field.type}): ${about(field)}?`,
    criteria,
  );
}

type Answers = Record<string, ChoiceResponse>;

async function ask(reading: Reading, questions: Record<string, ReturnType<typeof choice>>) {
  if (Object.keys(questions).length === 0) return {};
  const result = await new TypeSafeClient().systemOne({
    model: models.jev,
    state: { document: reading },
    questions,
  });
  usage.record({
    model: result.model,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  });
  return result.answers as Answers;
}

const picked = (answers: Answers, id: string) => {
  const answer = answers[id];
  return { choice: answer.choice, probability: answer.probabilities[answer.choice] };
};

export const matcher: Matcher = {
  async match(reading, { fields, lists }) {
    const leaves = readingLeaves(reading);
    const arrays = readingArrays(reading);
    const first = await ask(reading, {
      ...Object.fromEntries(fields.map((f) => [`field_${f.key}`, fieldQuestion(f, leaves)])),
      ...Object.fromEntries(lists.map((l) => [`list_${l.key}`, listQuestion(l, arrays)])),
    });

    const chosenArrays = new Map<string, ReadingArray>();
    for (const list of lists) {
      const { choice } = picked(first, `list_${list.key}`);
      if (choice !== "none") chosenArrays.set(list.key, arrays[Number(choice.slice(1))]);
    }
    const second = await ask(
      reading,
      Object.fromEntries(
        lists.flatMap((list) => {
          const array = chosenArrays.get(list.key);
          return array
            ? list.fields.map((f) => [`key_${list.key}_${f.key}`, keyQuestion(list, array, f)])
            : [];
        }),
      ),
    );

    return {
      fields: Object.fromEntries(
        fields.map((field): [string, Match] => {
          const { choice, probability } = picked(first, `field_${field.key}`);
          const leaf = choice === "none" ? undefined : leaves[Number(choice.slice(1))];
          return [field.key, { path: leaf?.path ?? null, probability }];
        }),
      ),
      lists: Object.fromEntries(
        lists.map((list): [string, ListMatch] => {
          const { probability } = picked(first, `list_${list.key}`);
          const array = chosenArrays.get(list.key);
          const keys = Object.fromEntries(
            list.fields.map((f): [string, Match] => {
              if (!array) return [f.key, { path: null, probability: 1 }];
              const key = picked(second, `key_${list.key}_${f.key}`);
              return [
                f.key,
                {
                  path: key.choice === "none" ? null : array.keys[Number(key.choice.slice(1))],
                  probability: key.probability,
                },
              ];
            }),
          );
          return [list.key, { path: array?.path ?? null, probability, keys }];
        }),
      ),
    };
  },
};
