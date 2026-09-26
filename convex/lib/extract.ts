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
  source: Leaf | undefined;
  match: number;
};

/** Every Field Value the Match result asks for, in Form order, List entries in order. */
function slotsOf(
  reading: Reading,
  fields: FlatField[],
  lists: ListField[],
  matches: { fields: Record<string, Match>; lists: Record<string, ListMatch> },
) {
  const leaves = readingLeaves(reading);
  const slots: Slot[] = fields.map((field) => {
    const { path, probability } = matches.fields[field.key];
    return {
      id: field.key,
      field,
      label: field.label,
      list: null,
      source: path === null ? undefined : sourceAt(leaves, path),
      match: probability,
    };
  });
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
          source: key.path === null ? undefined : sourceAt(leaves, `${path}[${entry}].${key.path}`),
          match: Math.min(probability, key.probability),
        });
      }
    }
    return { key: list.key, required: list.required, sourcePath: path, completeness: probability, entries };
  });
  return { slots, listResults };
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
    slot.source
      ? [{ id: slot.id, field: slot.field, source: { path: slot.source.path, text: slot.source.text } }]
      : [],
  );
  const filled = toFill.length > 0 ? await adapters.filler.fill(toFill) : {};

  const values = slots.map((slot) => {
    const checked = fitType(slot.field, slot.source ? filled[slot.id] : null);
    return { ...slot, value: checked.fits ? checked.value : null, typeMismatch: !checked.fits };
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
      console.error("Verify failed; the Document stays unverified", error);
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
