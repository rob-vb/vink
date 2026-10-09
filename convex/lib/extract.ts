// Match, Fill and Verify (ADR 0003) on a stored Reading: what one Extraction
// finds, before it is stored. The Extraction action and the fixture eval
// harness (scripts/eval) both run it, each with its own adapters.
import { fitType } from "./fieldTypes";
import { doesNotFit } from "./fit";
import { matchRequests } from "./matchPlan";
import type {
  Filler,
  FlatField,
  ListField,
  FilledValue,
  ListMatch,
  Match,
  Matcher,
  PageText,
  Reading,
  Verification,
  Verifier,
  VerifyRequest,
} from "./pipeline";
import { isConflicting, isUnsure, type Leaf, readingLeaves, sourceAt } from "./reading";

/**
 * One Field Value to be: a top-level Field, or a sub-Field of one List entry.
 * Its id is the Field key, or `list[entry].key`.
 */
type Slot = {
  id: string;
  field: FlatField;
  label: string;
  list: { key: string; entry: number } | null;
  /** Jev's pick first, then the other sources it weighed. */
  candidates: Candidate[];
  /** For a sub-Field, Jev's probability for the List's array; 1 otherwise. */
  arrayProbability: number;
};

/** A source Match weighed for a Field Value: `undefined` for `none`. */
type Candidate = { source: Leaf | undefined; probability: number };

/** A Match's pick and alternatives as Candidates, with their paths made whole by `pathOf`. */
function candidatesOf(leaves: Leaf[], match: Match, pathOf: (path: string) => string): Candidate[] {
  const alternatives = [...(match.alternatives ?? [])].sort((a, b) => b.probability - a.probability);
  return [match, ...alternatives].map(({ path, probability }) => ({
    source: path === null ? undefined : sourceAt(leaves, pathOf(path)),
    probability,
  }));
}

/** Every Field Value the Match result asks for, in Form order, List entries in order. */
function slotsOf(
  reading: Reading,
  fields: FlatField[],
  lists: ListField[],
  matches: { fields: Record<string, Match>; lists: Record<string, ListMatch> },
) {
  const leaves = readingLeaves(reading);
  const slots: Slot[] = fields.map((field) => ({
    id: field.key,
    field,
    label: field.label,
    list: null,
    candidates: candidatesOf(leaves, matches.fields[field.key], (path) => path),
    arrayProbability: 1,
  }));
  const listResults = lists.map((list) => {
    const { path, probability, keys } = matches.lists[list.key];
    const entries = path === null ? 0 : entryCount(reading, path);
    for (let entry = 0; entry < entries; entry++) {
      for (const field of list.fields) {
        const key = keys[field.key];
        slots.push({
          id: `${list.key}[${entry}].${field.key}`,
          field,
          label: `${list.label} → ${field.label}`,
          list: { key: list.key, entry },
          candidates: candidatesOf(leaves, key, (keyPath) => `${path}[${entry}].${keyPath}`),
          arrayProbability: probability,
        });
      }
    }
    return { key: list.key, required: list.required, sourcePath: path, completeness: probability, entries };
  });
  return { slots, listResults };
}

/** Jev's pick fills under the value's own id; an alternative under `id@path`. */
function fillId(slot: Slot, candidate: number) {
  return candidate === 0 ? slot.id : `${slot.id}@${slot.candidates[candidate].source!.path}`;
}

/** Equal Field Values compare equal here: text ignores case and spaces. */
function sameValueKey(value: FilledValue) {
  return typeof value === "string" ? `s:${value.toLowerCase().replace(/\s+/g, "")}` : JSON.stringify(value);
}

/**
 * The value that most of Jev's probability supports: each source it weighed
 * counts for the value it fills to, so a total on two papers isn't split in
 * two. Its Match probability is that sum; its source the likeliest one that
 * gives it. A tie goes to Jev's pick.
 */
function likeliestValue(slot: Slot, filled: Record<string, FilledValue>) {
  const options = slot.candidates.map((candidate, i) => {
    const checked = fitType(slot.field, candidate.source ? filled[fillId(slot, i)] : null);
    return {
      ...candidate,
      value: checked.fits ? checked.value : null,
      typeMismatch: !checked.fits,
      // A value that doesn't fit its type only counts for itself.
      key: checked.fits ? sameValueKey(checked.value) : `mismatch:${i}`,
    };
  });
  const totals = new Map<string, number>();
  for (const { key, probability } of options) totals.set(key, (totals.get(key) ?? 0) + probability);
  const best = options.reduce((a, b) => (totals.get(b.key)! > totals.get(a.key)! ? b : a));
  return { ...best, probability: totals.get(best.key)! };
}

/** How many elements the array at a path in the Reading has. */
function entryCount(reading: Reading, path: string) {
  const array = [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].reduce<unknown>(
    (node, m) => (node as Record<string, unknown> | undefined)?.[m[2] ?? m[1]],
    reading,
  );
  return Array.isArray(array) ? array.length : 0;
}

export type ExtractInput = {
  reading: Reading;
  textLayer: PageText[];
  formName: string;
  formDescription: string | null;
  fields: FlatField[];
  lists: ListField[];
};

export type Extracted = Awaited<ReturnType<typeof extract>>;

/**
 * Matches the Form's Fields in the Reading, fills and verifies their values.
 * A Verify failure doesn't throw: the result is just not Jev-verified.
 */
export async function extract(
  { reading, textLayer, formName, formDescription, fields, lists }: ExtractInput,
  adapters: { matcher: Matcher; filler: Filler; verifier: Verifier },
) {
  const matches = { fields: {}, lists: {} } as Awaited<ReturnType<Matcher["match"]>>;
  for (const request of matchRequests(reading, fields, lists)) {
    const answer = await adapters.matcher.match(reading, request);
    Object.assign(matches.fields, answer.fields);
    Object.assign(matches.lists, answer.lists);
  }
  const { slots, listResults } = slotsOf(reading, fields, lists, matches);

  const toFill = slots.flatMap((slot) =>
    slot.candidates.flatMap(({ source }, i) =>
      source
        ? [{ id: fillId(slot, i), field: slot.field, source: { path: source.path, text: source.text } }]
        : [],
    ),
  );
  const filled = toFill.length > 0 ? await adapters.filler.fill(toFill) : {};

  const values = slots.map((slot) => {
    const { source, value, typeMismatch, probability } = likeliestValue(slot, filled);
    return { ...slot, source, value, typeMismatch, match: Math.min(slot.arrayProbability, probability) };
  });

  const pageTexts = new Map(textLayer.map((p) => [p.page, p.text]));
  const toVerify = values.flatMap(({ id, field, label, source, value }): VerifyRequest[] => {
    if (source === undefined || value === null) return [];
    const texts = source.pages.flatMap((page) => pageTexts.get(page) ?? []);
    return [
      {
        id,
        field,
        label,
        value,
        readText: source.text,
        pages: source.pages,
        pageText: texts.length > 0 ? texts.join("\n\n") : null,
      },
    ];
  });
  let verifications: Record<string, Verification> = {};
  let jevVerified = true;
  if (toVerify.length > 0) {
    try {
      verifications = await adapters.verifier.verify(
        { formName: formName, formDescription, reading },
        toVerify,
      );
    } catch (error) {
      console.error("Verify failed; the Submission stays unverified", error);
      jevVerified = false;
    }
  }

  return {
    jevVerified,
    doesNotFit: doesNotFit(reading, fields, lists, matches),
    lists: listResults,
    fieldValues: values.map(({ id, field, list, source, value, match, typeMismatch }) => ({
      key: field.key,
      ...(list ? { list } : {}),
      required: field.required,
      value,
      readText: source?.text ?? null,
      sourcePath: source?.path ?? null,
      pages: source?.pages ?? [],
      signals: {
        match,
        fit: verifications[id]?.fit ?? null,
        support: verifications[id]?.support ?? null,
      },
      typeMismatch,
      unsure: source ? isUnsure(reading, source.path) : false,
      conflicting: source ? isConflicting(reading, source.path) : false,
    })),
  };
}
