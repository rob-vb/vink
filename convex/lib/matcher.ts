"use node";
// Match (ADR 0003): Jev picks, per top-level Field, the leaf of the Reading
// that holds it, and per List Field the array of objects that holds its
// entries, `none` included. A second request then picks, per sub-Field, the
// key inside the chosen array's elements. The whole Reading is Jev's state.
import { type ChoiceResponse, TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { MAX_CRITERIA, MAX_OBJECTS } from "./matchPlan";
import { models } from "./models";
import type { FlatField, ListField, ListMatch, Match, Matcher, Reading } from "./pipeline";
import {
  type Leaf,
  type ReadingArray,
  type ReadingObject,
  readingArrays,
  readingLeaves,
  readingObjects,
} from "./reading";
import { usage } from "./usage";

const NONE = { none: "Nothing in the Reading holds this" };

const WHOLE =
  "Pick a whole object only when the value needs several of its values together (e.g. a brand and a model kept apart); otherwise the one value.";

// Jev answered none for a brand-and-model Field when only the model was on the
// Document (eval, 2026-09-26); part of a value is worth a user's review.
const PART =
  "When the Document holds only part of what the Field asks for (e.g. a model without its brand), pick that part rather than none.";

function objectCriterion(path: string, keys: string[]) {
  return `object \`${path}\` (${keys.slice(0, 8).join(", ")}${keys.length > 8 ? ", …" : ""})`;
}

/** Whether a leaf could hold a value of the Field's type at all. */
function couldHold(field: FlatField, leaf: Leaf) {
  if (field.type === "number") return /\d/.test(leaf.text);
  if (field.type === "date") return /\d{1,4}[/.\-\s]\S+[/.\-\s]\d{2,4}/.test(leaf.text);
  return true;
}

function about(field: { label: string; description?: string }) {
  return [field.label, field.description].filter(Boolean).join(": ");
}

// Each criterion is a leaf's path only: its value is in the state already, and
// repeating it per Field doubled the request for the same answers (eval,
// 2026-09-25: 76/84 values either way).
function fieldQuestion(field: FlatField, leaves: Leaf[], objects: ReadingObject[]) {
  const criteria: Record<string, string> = { ...NONE };
  const wholes = objects.slice(0, MAX_OBJECTS);
  leaves.forEach((leaf, i) => {
    if (couldHold(field, leaf) && Object.keys(criteria).length < MAX_CRITERIA - wholes.length) {
      criteria[`v${i}`] = `\`${leaf.path}\``;
    }
  });
  wholes.forEach((object, i) => {
    criteria[`o${i}`] = objectCriterion(object.path, object.keys);
  });
  return choice(
    `Which value in \`document\` is the Field "${field.key}" (${field.type}) of this Form: ${about(field)}? ${WHOLE} ${PART}`,
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

/** The objects inside an array's elements, as key prefixes shared by two or more keys (e.g. `removed`). */
function elementObjects(array: ReadingArray): ReadingObject[] {
  const byPrefix = new Map<string, string[]>();
  for (const key of array.keys) {
    const parts = key.split(".");
    for (let n = 1; n < parts.length; n++) {
      const prefix = parts.slice(0, n).join(".");
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), parts.slice(n).join(".")]);
    }
  }
  return [...byPrefix].filter(([, keys]) => keys.length >= 2).map(([path, keys]) => ({ path, keys }));
}

function keyQuestion(list: ListField, array: ReadingArray, field: FlatField) {
  const criteria: Record<string, string> = { ...NONE };
  const wholes = elementObjects(array).slice(0, MAX_OBJECTS);
  array.keys.slice(0, MAX_CRITERIA - 1 - wholes.length).forEach((key, i) => {
    criteria[`k${i}`] = `key \`${key}\``;
  });
  wholes.forEach((object, i) => {
    criteria[`o${i}`] = objectCriterion(object.path, object.keys);
  });
  return choice(
    `Each element of \`document.${array.path}\` is one entry of "${list.key}". Which key inside those elements holds the sub-Field "${field.key}" (${field.type}): ${about(field)}? ${WHOLE} ${PART}`,
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

// Below this, a source Jev weighed isn't worth filling (see extract.likeliestValue).
const ALTERNATIVE_MIN = 0.05;

/** Jev's pick for a question as a Match, with the other criteria it gave some probability. */
function matchOf(answers: Answers, id: string, pathOf: (choice: string) => string | null): Match {
  const { choice, probability } = picked(answers, id);
  const alternatives = Object.entries(answers[id].probabilities)
    .filter(([label, p]) => label !== choice && p >= ALTERNATIVE_MIN)
    .map(([label, p]) => ({ path: pathOf(label), probability: p }));
  return { path: pathOf(choice), probability, ...(alternatives.length > 0 ? { alternatives } : {}) };
}

/** The path a Field's answer names: a leaf (`v…`), an object (`o…`), or none. */
function pathOf(choice: string, leaves: Leaf[], objects: ReadingObject[]) {
  if (choice === "none") return null;
  const index = Number(choice.slice(1));
  return choice.startsWith("o") ? objects[index].path : leaves[index].path;
}

export const matcher: Matcher = {
  async match(reading, { fields, lists }) {
    const leaves = readingLeaves(reading);
    const objects = readingObjects(reading);
    const arrays = readingArrays(reading);
    const first = await ask(reading, {
      ...Object.fromEntries(fields.map((f) => [`field_${f.key}`, fieldQuestion(f, leaves, objects)])),
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
        fields.map((field): [string, Match] => [
          field.key,
          matchOf(first, `field_${field.key}`, (choice) => pathOf(choice, leaves, objects)),
        ]),
      ),
      lists: Object.fromEntries(
        lists.map((list): [string, ListMatch] => {
          const { probability } = picked(first, `list_${list.key}`);
          const array = chosenArrays.get(list.key);
          const keys = Object.fromEntries(
            list.fields.map((f): [string, Match] => {
              if (!array) return [f.key, { path: null, probability: 1 }];
              const wholes = elementObjects(array);
              const keyPath = (choice: string) =>
                choice === "none"
                  ? null
                  : choice.startsWith("o")
                    ? wholes[Number(choice.slice(1))].path
                    : array.keys[Number(choice.slice(1))];
              return [f.key, matchOf(second, `key_${list.key}_${f.key}`, keyPath)];
            }),
          );
          return [list.key, { path: array?.path ?? null, probability, keys }];
        }),
      ),
    };
  },
};
