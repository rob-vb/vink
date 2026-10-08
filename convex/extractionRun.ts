"use node";
// One Extraction (ADR 0003, ADR 0010): Read (by the Document's kind), then,
// for a Document that came without a Form, the Router, then Match, Fill and
// Verify (lib/extract).
// Workpool retries the whole action, and a retry skips Read once a Reading is
// stored. A Verify failure doesn't fail the Extraction: the Document is just
// not Jev-verified.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { extract } from "./lib/extract";
import { filler } from "./lib/filler";
import { matcher } from "./lib/matcher";
import { pdfStore } from "./lib/pdfStore";
import type { Reading } from "./lib/pipeline";
import { reader } from "./lib/reader";
import { router } from "./lib/router";
import { readerInputOf, UnreadableInput } from "./lib/readerInput";
import { verifier } from "./lib/verifier";

export const run = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const { organisationId, fileKey, kind, mimeType, pageCount, readingJson } = await ctx.runQuery(
      internal.extraction.input,
      { documentId },
    );
    if (readingJson === null) {
      // The Reader is picked by the Document's kind, with no model (ADR 0010).
      let input;
      try {
        input = await readerInputOf(pdfStore, { fileKey, kind, mimeType, pageCount }, organisationId);
      } catch (error) {
        if (!(error instanceof UnreadableInput)) throw error;
        // Trying again cannot help: fail now, not after the pool's retries.
        await ctx.runMutation(internal.extraction.failUnreadable, { documentId, error: error.message });
        return;
      }
      const { reading, textLayer } = await reader.read(input);
      await ctx.runMutation(internal.extraction.saveReading, {
        documentId,
        json: JSON.stringify(reading),
        textLayer,
      });
    }

    // Match, Fill and Verify always work from the stored Reading.
    const stored = await ctx.runQuery(internal.extraction.input, { documentId });
    const reading = JSON.parse(stored.readingJson!) as Reading;

    // No Form yet: Jev picks one among the Organisation's Forms (ADR 0010).
    // Its pick is not final; `finish` gates it with the fit check.
    let form = stored;
    let routed;
    if (stored.routableForms !== null) {
      // With no Forms there is nothing to ask Jev.
      const pick =
        stored.routableForms.length === 0
          ? { formId: null, probability: 1 }
          : await router.route(reading, stored.routableForms);
      if (pick.formId === null) {
        await ctx.runMutation(internal.extraction.noForm, {
          documentId,
          detail: stored.routableForms.length === 0 ? "The Organisation has no Forms" : "No Form fits",
        });
        return;
      }
      const formId = stored.routableForms.find((f) => f.id === pick.formId)!.id as Id<"forms">;
      const picked = await ctx.runQuery(internal.extraction.routedForm, { formId });
      form = { ...stored, ...picked };
      routed = { formId, formVersion: picked.formVersion, probability: pick.probability };
    }

    const extracted = await extract(
      {
        reading,
        textLayer: stored.textLayer,
        formName: form.formName,
        formDescription: form.formDescription,
        fields: form.fields,
        lists: form.lists,
      },
      { matcher, filler, verifier },
    );
    await ctx.runMutation(internal.extraction.finish, { documentId, routed, ...extracted });
  },
});
