"use node";
// One Form Proposal run: Read the sample (unless its Reading is stored), then
// one Proposer call. Workpool retries the whole action.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { pdfStore } from "./lib/pdfStore";
import type { Reading } from "./lib/pipeline";
import { proposer } from "./lib/proposer";
import { reader } from "./lib/reader";

export const run = internalAction({
  args: { proposalId: v.id("formProposals") },
  handler: async (ctx, { proposalId }) => {
    const input = await ctx.runQuery(internal.formProposals.runInput, { proposalId });
    if (input === null) return;
    const pdf = await pdfStore.read(input.key);
    if (pdf === null) throw new Error(`No PDF stored under ${input.key}`);
    let reading: Reading;
    let textLayer = input.textLayer;
    if (input.readingJson === null) {
      const read = await reader.read(pdf);
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
    const fields = await proposer.propose({ pdf, reading, textLayer });
    await ctx.runMutation(internal.formProposals.saveFields, { proposalId, fields });
  },
});
