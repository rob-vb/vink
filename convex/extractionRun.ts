"use node";
// One Extraction (ADR 0003): Read, then Match, Fill and Verify (lib/extract).
// Workpool retries the whole action, and a retry skips Read once a Reading is
// stored. A Verify failure doesn't fail the Extraction: the Document is just
// not Jev-verified.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { extract } from "./lib/extract";
import { filler } from "./lib/filler";
import { matcher } from "./lib/matcher";
import { pdfStore } from "./lib/pdfStore";
import type { Reading } from "./lib/pipeline";
import { reader } from "./lib/reader";
import { verifier } from "./lib/verifier";

export const run = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const { fileKey, readingJson } = await ctx.runQuery(internal.extraction.input, {
      documentId,
    });
    if (readingJson === null) {
      const pdf = await pdfStore.read(fileKey);
      if (pdf === null) throw new Error(`No PDF stored under ${fileKey}`);
      const { reading, textLayer } = await reader.read(pdf);
      await ctx.runMutation(internal.extraction.saveReading, {
        documentId,
        json: JSON.stringify(reading),
        textLayer,
      });
    }

    // Match, Fill and Verify always work from the stored Reading.
    const stored = await ctx.runQuery(internal.extraction.input, { documentId });
    const extracted = await extract(
      {
        reading: JSON.parse(stored.readingJson!) as Reading,
        textLayer: stored.textLayer,
        formName: stored.formName,
        formDescription: stored.formDescription,
        fields: stored.fields,
        lists: stored.lists,
      },
      { matcher, filler, verifier },
    );
    await ctx.runMutation(internal.extraction.finish, { documentId, ...extracted });
  },
});
