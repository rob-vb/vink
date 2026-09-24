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
import { pdfStore } from "./lib/pdfStore";
import type { Reading, Verification, VerifyRequest } from "./lib/pipeline";
import { reader } from "./lib/reader";
import { isConflicting, isUnsure, readingLeaves } from "./lib/reading";
import { verifier } from "./lib/verifier";

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
    const { fields, textLayer } = stored;
    const matches = await matcher.match(reading, fields);

    const leaves = new Map(readingLeaves(reading).map((leaf) => [leaf.path, leaf]));
    const sourceOf = (key: string) => {
      const path = matches[key]?.path;
      return path == null ? undefined : leaves.get(path);
    };
    const requests = fields.flatMap((field) => {
      const source = sourceOf(field.key);
      return source ? [{ field, source: { path: source.path, text: source.text } }] : [];
    });
    const filled = requests.length > 0 ? await filler.fill(requests) : {};

    const values = fields.map((field) => {
      const source = sourceOf(field.key);
      const checked = fitType(field, source ? filled[field.key] : null);
      return {
        field,
        source,
        value: checked.fits ? checked.value : null,
        typeMismatch: !checked.fits,
      };
    });

    const pageTexts = new Map(textLayer.map((p) => [p.page, p.text]));
    const toVerify = values.flatMap(({ field, source, value }): VerifyRequest[] => {
      if (source === undefined || value === null) return [];
      const texts = source.pages.flatMap((page) => pageTexts.get(page) ?? []);
      return [
        {
          field,
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
      fieldValues: values.map(({ field, source, value, typeMismatch }) => ({
        key: field.key,
        required: field.required,
        value,
        readText: source?.text ?? null,
        sourcePath: source?.path ?? null,
        pages: source?.pages ?? [],
        signals: {
          match: matches[field.key]?.probability ?? 0,
          fit: verifications[field.key]?.fit ?? null,
          support: verifications[field.key]?.support ?? null,
        },
        typeMismatch,
        unsure: source ? isUnsure(reading, source.path) : false,
        conflicting: source ? isConflicting(reading, source.path) : false,
      })),
    });
  },
});
