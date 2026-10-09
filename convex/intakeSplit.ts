"use node";
// Runs the email split (lib/splitter.ts) for convex/intake.ts, which cannot
// import a Node file itself.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { splitter } from "./lib/splitter";

export const decide = internalAction({
  args: {
    subject: v.string(),
    from: v.string(),
    body: v.string(),
    attachments: v.array(
      v.object({
        filename: v.string(),
        kind: v.union(v.literal("pdf"), v.literal("image")),
        pageCount: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (_ctx, mail) => await splitter.split(mail),
});
