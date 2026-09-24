"use node";
// One Extraction (ADR 0003): Read, Match, Fill, then Verify. Workpool retries
// the whole action, and a retry skips Read once a Reading is stored. A Verify
// failure doesn't fail the Extraction: the Document is just not Jev-verified.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { fitType } from "./lib/fieldTypes";
import { filler } from "./lib/filler";
import { matcher } from "./lib/matcher";
import { matchRequests } from "./lib/matchPlan";
import { pdfStore } from "./lib/pdfStore";
import type {
  FlatField,
  ListField,
  ListMatch,
  Match,
  Reading,
  Verification,
  VerifyRequest,
} from "./lib/pipeline";
import { reader } from "./lib/reader";
import { isConflicting, isUnsure, type Leaf, readingLeaves } from "./lib/reading";
import { verifier } from "./lib/verifier";

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
  const leaves = new Map(readingLeaves(reading).map((leaf) => [leaf.path, leaf]));
  const slots: Slot[] = fields.map((field) => {
    const { path, probability } = matches.fields[field.key];
    return {
      id: field.key,
      field,
      label: field.label,
      list: null,
      source: path === null ? undefined : leaves.get(path),
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
          source: key.path === null ? undefined : leaves.get(`${path}[${entry}].${key.path}`),
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

export const run = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const { pdfKey, readingJson } = await ctx.runQuery(internal.extraction.input, {
      documentId,
    });
    if (readingJson === null) {
      const pdf = await pdfStore.read(pdfKey);
      if (pdf === null) throw new Error(`No PDF stored under ${pdfKey}`);
      const { reading, textLayer } = await reader.read(pdf);
      await ctx.runMutation(internal.extraction.saveReading, {
        documentId,
        json: JSON.stringify(reading),
        textLayer,
      });
    }

    // Match, Fill and Verify always work from the stored Reading.
    const stored = await ctx.runQuery(internal.extraction.input, { documentId });
    const reading = JSON.parse(stored.readingJson!) as Reading;
    const { fields, lists, textLayer } = stored;
    const matches = { fields: {}, lists: {} } as Awaited<ReturnType<typeof matcher.match>>;
    for (const request of matchRequests(reading, fields, lists)) {
      const answer = await matcher.match(reading, request);
      Object.assign(matches.fields, answer.fields);
      Object.assign(matches.lists, answer.lists);
    }
    const { slots, listResults } = slotsOf(reading, fields, lists, matches);

    const toFill = slots.flatMap((slot) =>
      slot.source
        ? [{ id: slot.id, field: slot.field, source: { path: slot.source.path, text: slot.source.text } }]
        : [],
    );
    const filled = toFill.length > 0 ? await filler.fill(toFill) : {};

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
        verifications = await verifier.verify(
          { formName: stored.formName, formDescription: stored.formDescription, reading },
          toVerify,
        );
      } catch (error) {
        console.error("Verify failed; the Document stays unverified", error);
        jevVerified = false;
      }
    }

    await ctx.runMutation(internal.extraction.finish, {
      documentId,
      jevVerified,
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
    });
  },
});
