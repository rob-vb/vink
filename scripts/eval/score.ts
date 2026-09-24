// Scores one fixture Document's Extraction against its expected.json (see
// fixtures/README.md). Paths the user marked `unknown` are left out.
import { confidenceOf, reviewReasonsOf } from "../../convex/lib/confidence";
import type { Extracted } from "../../convex/lib/extract";

type FixtureType = "string" | "number" | "date";

/** A Form definition in fixtures/forms. */
export type FixtureForm = {
  name: string;
  fields: Array<
    | { name: string; type: FixtureType }
    | { name: string; type: "list"; fields: Array<{ name: string; type: FixtureType }> }
  >;
};

type Truth = string | number | null;

/** A fixture Document's ground truth, fixtures/documents/<doc>/expected.json. */
export type Expected = {
  form: string;
  fieldValues: Record<string, Truth | Array<Record<string, Truth>>>;
  verified: string[];
  unverified: string[];
  unknown: string[];
};

const normalised = (x: unknown) =>
  typeof x === "string" ? x.trim().toLowerCase().replace(/\s+/g, "") : x;

function same(got: unknown, want: Truth) {
  if (got === null || want === null) return got === want;
  if (typeof got === "number" || typeof want === "number") return Number(got) === Number(want);
  return normalised(got) === normalised(want);
}

/** One scored path, e.g. `total` or `tireChanges[0].position`. */
type Judged = { path: string; got: unknown; want: Truth; right: boolean; needsReview: boolean };

type ExtractedValue = Extracted["fieldValues"][number];

/** Whether the app would show this value as Needs Review, as extraction.finish does. */
function needsReview(value: ExtractedValue, threshold: number) {
  const { confidence } = confidenceOf(value.signals);
  return (
    reviewReasonsOf({ ...value, confidence, threshold, empty: value.value === null }).length > 0
  );
}

function listNeedsReview(list: Extracted["lists"][number], threshold: number) {
  return (
    reviewReasonsOf({
      confidence: list.completeness,
      threshold,
      required: list.required,
      empty: list.entries === 0,
      typeMismatch: false,
      unsure: false,
      conflicting: false,
    }).length > 0
  );
}

export function scoreFixture({
  form,
  expected,
  extracted,
  threshold,
}: {
  form: FixtureForm;
  expected: Expected;
  extracted: Extracted;
  threshold: number;
}) {
  const unknown = new Set(expected.unknown);
  const judged: Judged[] = [];
  const lists: boolean[] = [];
  const judge = (path: string, got: ExtractedValue | undefined, want: Truth, list?: { aligned: boolean; needsReview: boolean }) => {
    if (unknown.has(path)) return;
    const value = got?.value ?? null;
    judged.push({
      path,
      got: value,
      want,
      right: (list?.aligned ?? true) && same(value, want),
      needsReview: (list?.needsReview ?? false) || (got !== undefined && needsReview(got, threshold)),
    });
  };
  for (const field of form.fields) {
    if (field.type !== "list") {
      const got = extracted.fieldValues.find((v) => !v.list && v.key === field.name);
      judge(field.name, got, expected.fieldValues[field.name] as Truth);
      continue;
    }
    const want = expected.fieldValues[field.name] as Array<Record<string, Truth>>;
    const found = extracted.lists.find((l) => l.key === field.name);
    const list = {
      aligned: found?.entries === want.length,
      needsReview: found !== undefined && listNeedsReview(found, threshold),
    };
    lists.push(list.aligned);
    want.forEach((wantEntry, entry) => {
      for (const sub of field.fields) {
        const got = extracted.fieldValues.find(
          (v) => v.list?.key === field.name && v.list.entry === entry && v.key === sub.name,
        );
        judge(`${field.name}[${entry}].${sub.name}`, got, wantEntry[sub.name], list);
      }
    });
  }
  const verified = new Set(expected.verified);
  return {
    values: tally(judged),
    verifiedValues: tally(judged.filter((j) => verified.has(j.path))),
    lists: { right: lists.filter(Boolean).length, total: lists.length },
    needsReview: {
      flagged: judged.filter((j) => j.needsReview).length,
      wrong: judged.filter((j) => !j.right).length,
      wrongFlagged: judged.filter((j) => !j.right && j.needsReview).length,
    },
    mistakes: judged
      .filter((j) => !j.right)
      .map(({ path, got, want, needsReview }) => ({ path, got, want, needsReview })),
  };
}

function tally(judged: Judged[]) {
  return { right: judged.filter((j) => j.right).length, total: judged.length };
}
