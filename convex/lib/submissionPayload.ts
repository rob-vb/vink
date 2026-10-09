// A Submission's Payload from its stored Field Values: corrections included,
// removed List entries left out (lib/payload.ts builds the JSON).
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { formOf } from "./submissionForm";
import { payloadOf } from "./payload";
import type { FilledValue } from "./pipeline";
import { liveEntries } from "./reviewState";

export async function submissionPayload(ctx: QueryCtx, submission: Doc<"submissions">) {
  const { formId, formVersion: number } = formOf(submission);
  const formVersion = (await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) =>
      q.eq("formId", formId).eq("number", number),
    )
    .unique())!;
  const fieldValues = await ctx.db
    .query("fieldValues")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
    .take(5000);
  const listValues = await ctx.db
    .query("listValues")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
    .take(100);
  const fields: Record<string, FilledValue> = {};
  const lists: Record<string, Array<Record<string, FilledValue>>> = {};
  for (const list of listValues) {
    lists[list.key] = liveEntries(list).map((entry) =>
      Object.fromEntries(
        fieldValues
          .filter((f) => f.list?.key === list.key && f.list.entry === entry)
          .map((f) => [f.key, f.value]),
      ),
    );
  }
  for (const f of fieldValues) if (!f.list) fields[f.key] = f.value;
  return payloadOf(formVersion.fields, { fields, lists });
}
