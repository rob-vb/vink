"use node";
// One Form Proposal run: Read the sample (unless its Reading is stored), then
// one Proposer call. A description in words has no sample: just the Proposer's
// text-only call. Workpool retries the whole action.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { pdfStore } from "./lib/pdfStore";
import type { Reading } from "./lib/pipeline";
import { matcher } from "./lib/matcher";
import { matchRequests } from "./lib/matchPlan";
import { proposer } from "./lib/proposer";
import { reader } from "./lib/reader";
import { readerInputOf, UnreadableInput } from "./lib/readerInput";
import { readingLeaves, withoutPaths } from "./lib/reading";

export const run = internalAction({
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    const input = await ctx.runQuery(internal.formProposals.runInput, { proposalId });
    if (input === null) return;
    if (input.description !== null) {
      // Nothing is read, so nothing was charged (formProposals.createFromDescription).
      const fields = await proposer.describe(input.description);
      await ctx.runMutation(internal.formProposals.saveFields, { proposalId, fields });
      return;
    }
    if (input.key === null) {
      await ctx.runMutation(internal.formProposals.failUnreadable, {
        proposalId,
        error: "This proposal has no sample and no description",
      });
      return;
    }
    let sample;
    try {
      sample = await readerInputOf(
        pdfStore,
        { fileKey: input.key, kind: input.kind, mimeType: input.mimeType, pageCount: input.pageCount },
        input.organisationId,
      );
    } catch (error) {
      if (!(error instanceof UnreadableInput)) throw error;
      // Trying again cannot help: fail now, not after the pool's retries.
      await ctx.runMutation(internal.formProposals.failUnreadable, { proposalId, error: error.message });
      return;
    }
    let reading: Reading;
    let textLayer = input.textLayer;
    if (input.readingJson === null) {
      const read = await reader.read(sample);
      reading = read.reading;
      textLayer = read.textLayer;
      await ctx.runMutation(internal.formProposals.saveReading, {
        proposalId,
        json: JSON.stringify(reading),
        textLayer,
      });
    } else {
      reading = JSON.parse(input.readingJson) as Reading;
    }
    // "Suggest Fields from PDF": propose only what the Form can't place yet,
    // the parts of the Reading its Fields matched to `none`.
    if (input.extends) {
      const matches = { fields: {}, lists: {} } as Awaited<ReturnType<typeof matcher.match>>;
      for (const request of matchRequests(reading, input.fields, input.lists)) {
        const answer = await matcher.match(reading, request);
        Object.assign(matches.fields, answer.fields);
        Object.assign(matches.lists, answer.lists);
      }
      const placed = [...Object.values(matches.fields), ...Object.values(matches.lists)].flatMap(
        (m) => (m.path === null ? [] : [m.path]),
      );
      reading = withoutPaths(reading, placed);
      if (readingLeaves(reading).length === 0) {
        await ctx.runMutation(internal.formProposals.saveFields, { proposalId, fields: [] });
        return;
      }
    }
    const fields = await proposer.propose({ input: sample, reading, textLayer });
    await ctx.runMutation(internal.formProposals.saveFields, { proposalId, fields });
  },
});
