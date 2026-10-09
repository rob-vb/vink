import { expect, test } from "vitest";
import { allProblems, toDraft } from "./draft";

const legacy = {
  name: "Facturen",
  fields: [{ type: "text" as const, label: "Totaal", key: "totaalInclBtw", required: true }],
};

test("a camelCase key saved before keys were snake_case is no problem while it is locked", () => {
  const draft = toDraft({ ...legacy, keysLocked: true });
  expect(allProblems(draft.fields).get(draft.fields[0].id)).toEqual([]);
});

test("without an Integration the same key must become snake_case", () => {
  const draft = toDraft({ ...legacy, keysLocked: false });
  expect(allProblems(draft.fields).get(draft.fields[0].id)).toEqual(["key"]);
});
