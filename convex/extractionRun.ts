"use node";
// One Extraction (ADR 0003, ADR 0010): Read (by the Document's kind), then Match, Fill and Verify (lib/extract).
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
import { readerInputOf } from "./lib/readerInput";
import { verifier } from "./lib/verifier";

export const run = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const { fileKey, kind, mimeType, pageCount, readingJson } = await ctx.runQuery(
      internal.extraction.input,
      { documentId },
    );
    if (readingJson === null) {
      // The Reader is picked by the Document's kind, with no model (ADR 0010).
      const input = await readerInputOf(pdfStore, { fileKey, kind, mimeType, pageCount });
      const { reading, textLayer } = await reader.read(input);
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
