"use node";
// One Extraction (ADR 0003): Read, then Match, then Fill. Verify comes in
// ticket 24. Workpool retries the whole action, and a retry skips Read once a
// Reading is stored.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { filler } from "./lib/filler";
import { matcher } from "./lib/matcher";
import { pdfStore } from "./lib/pdfStore";
import type { Reading } from "./lib/pipeline";
import { reader } from "./lib/reader";
import { readingLeaves } from "./lib/reading";

export const run = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const { pdfKey, readingJson } = await ctx.runQuery(internal.extraction.input, {
      documentId,
    });
    if (readingJson === null) {
      const pdf = await pdfStore.read(pdfKey);
      if (pdf === null) throw new Error(`No PDF stored under ${pdfKey}`);
      const reading = await reader.read(pdf);
      await ctx.runMutation(internal.extraction.saveReading, {
        documentId,
        json: JSON.stringify(reading),
      });
    }

    // Match and Fill always work from the stored Reading.
    const stored = await ctx.runQuery(internal.extraction.input, { documentId });
    const reading = JSON.parse(stored.readingJson!) as Reading;
    const { fields } = stored;
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

    await ctx.runMutation(internal.extraction.finish, {
      documentId,
      fieldValues: fields.map((field) => {
        const source = sourceOf(field.key);
        return {
          key: field.key,
          value: source ? (filled[field.key] ?? null) : null,
          readText: source?.text ?? null,
          sourcePath: source?.path ?? null,
          pages: source?.pages ?? [],
          matchProbability: matches[field.key]?.probability ?? 0,
        };
      }),
    });
  },
});
