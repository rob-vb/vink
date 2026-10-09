// Deleting an Organisation or an account (Settings → Danger Zone, and the
// user menu), as Privacy and Terms promise. Both happen at once: Stripe stops
// the Plan, one mutation takes away all access, then `purge` removes every
// row and R2 object in batches. Nothing can be undone.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { deleteAuthRows } from "./auth";
import { deleteProposal } from "./formProposals";
import { orgAction, userAction, userQuery } from "./lib/functions";
import { removeDocumentFiles } from "./lib/documentFiles";
import { pdfStore } from "./lib/pdfStore";

// Documents per purge run: each takes its Readings, Values, Deliveries and history along.
const BATCH = 10;

/** The name the Admin must type matches, ignoring outer spaces. */
export const organisationToDelete = internalQuery({
  args: { organisationId: v.id("organisations"), confirmName: v.string() },
  handler: async (ctx, { organisationId, confirmName }) => {
    const organisation = (await ctx.db.get(organisationId))!;
    if (confirmName.trim() !== organisation.name.trim()) throw new ConvexError("NameMismatch");
    return { stripeCustomerId: organisation.stripeCustomerId ?? null };
  },
});

/** Settings → Danger Zone: an Admin deletes the Organisation and everything in it. */
export const deleteOrganisation = orgAction({
  role: "admin",
  args: { confirmName: v.string() },
  handler: async (ctx, { confirmName }) => {
    const { stripeCustomerId } = await ctx.runQuery(internal.deletion.organisationToDelete, {
      organisationId: ctx.organisationId,
      confirmName,
    });
    await removeOrganisation(ctx, ctx.organisationId, stripeCustomerId);
  },
});

async function removeOrganisation(ctx: ActionCtx, organisationId: Id<"organisations">, stripeCustomerId: string | null) {
  // First Stripe: if that fails, nothing is gone yet and the Admin can try again.
  if (stripeCustomerId !== null) await ctx.runAction(internal.billing.cancelPlans, { customerId: stripeCustomerId });
  await ctx.runMutation(internal.deletion.close, { organisationId });
}

/** Takes away every way in (Members, Invitations, API Keys, Intake Addresses, Subscriptions), then purges. */
export const close = internalMutation({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const row of memberships) await ctx.db.delete(row._id);
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organisationId_and_email", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const row of invitations) await ctx.db.delete(row._id);
    for (const table of ["apiKeys", "subscriptions"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    // The Forms' addresses and the Organisation's own.
    const addresses = await ctx.db
      .query("intakeAddresses")
      .withIndex("by_organisationId_and_formId", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const address of addresses) await ctx.db.delete(address._id);
    await ctx.scheduler.runAfter(0, internal.deletion.purge, { organisationId });
  },
});

function formsOf(ctx: QueryCtx, organisationId: Id<"organisations">) {
  return ctx.db
    .query("forms")
    .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
    .collect();
}

async function deleteChildren(
  ctx: MutationCtx,
  table: "readings" | "fieldValues" | "listValues" | "deliveries" | "documentEvents",
  documentId: Id<"documents">,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

async function removeDocument(ctx: MutationCtx, document: Doc<"documents">) {
  if (document.dataDeletedAt === undefined) await removeDocumentFiles(ctx, document);
  for (const table of ["readings", "fieldValues", "listValues", "deliveries", "documentEvents"] as const) {
    await deleteChildren(ctx, table, document._id);
  }
  await ctx.db.delete(document._id);
}

async function removeForm(ctx: MutationCtx, form: Doc<"forms">) {
  const versions = await ctx.db
    .query("formVersions")
    .withIndex("by_formId_and_number", (q) => q.eq("formId", form._id))
    .collect();
  for (const row of versions) await ctx.db.delete(row._id);
  for (const table of ["intakeAddresses", "intakeEmails", "formIntegrations"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_formId", (q) => q.eq("formId", form._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  await ctx.db.delete(form._id);
}

async function removeIntegration(ctx: MutationCtx, integration: Doc<"integrations">) {
  for (const table of ["formIntegrations", "deliveries", "subscriptions"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_integrationId", (q) => q.eq("integrationId", integration._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  await ctx.db.delete(integration._id);
}

/**
 * Deletes one batch of a closed Organisation's data and runs again until
 * nothing is left; then the Organisation itself goes.
 */
export const purge = internalMutation({
  args: { organisationId: v.id("organisations") },
  handler: async (ctx, { organisationId }) => {
    const again = () => ctx.scheduler.runAfter(0, internal.deletion.purge, { organisationId });

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_organisationId_and_state", (q) => q.eq("organisationId", organisationId))
      .take(BATCH);
    for (const document of documents) await removeDocument(ctx, document);
    if (documents.length > 0) return void (await again());

    const proposals = await ctx.db
      .query("formProposals")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .take(BATCH);
    for (const proposal of proposals) await deleteProposal(ctx, proposal);
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .take(BATCH);
    for (const upload of uploads) {
      await pdfStore.remove(ctx, upload.key);
      await ctx.db.delete(upload._id);
    }
    if (proposals.length > 0 || uploads.length > 0) return void (await again());

    for (const form of await formsOf(ctx, organisationId)) await removeForm(ctx, form);
    // Recent emails of the Organisation's own Intake Address (a Form's go with the Form).
    const emails = await ctx.db
      .query("intakeEmails")
      .withIndex("by_organisationId_and_formId", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const row of emails) await ctx.db.delete(row._id);
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const integration of integrations) await removeIntegration(ctx, integration);
    for (const table of ["notifications", "topUpPayments", "descriptionQuotas"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_organisationId", (q) => q.eq("organisationId", organisationId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const counts = await ctx.db
      .query("documentCounts")
      .withIndex("by_organisationId_and_state", (q) => q.eq("organisationId", organisationId))
      .collect();
    for (const row of counts) await ctx.db.delete(row._id);
    await ctx.db.delete(organisationId);
  },
});

type AccountPlan = {
  /** Organisations where the user is the last Admin while others are Members: deleting is refused. */
  blockedBy: { name: string; slug: string }[];
  /** Organisations where the user is the only Member: they go with the account. */
  alsoDeleted: { _id: Id<"organisations">; name: string; stripeCustomerId: string | null }[];
};

async function accountPlanOf(ctx: QueryCtx, userId: string): Promise<AccountPlan> {
  const plan: AccountPlan = { blockedBy: [], alsoDeleted: [] };
  const mine = await ctx.db
    .query("memberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const membership of mine) {
    const organisation = await ctx.db.get(membership.organisationId);
    if (organisation === null) continue;
    const all = await ctx.db
      .query("memberships")
      .withIndex("by_organisationId_and_userId", (q) => q.eq("organisationId", organisation._id))
      .collect();
    if (all.length === 1) {
      plan.alsoDeleted.push({
        _id: organisation._id,
        name: organisation.name,
        stripeCustomerId: organisation.stripeCustomerId ?? null,
      });
    } else if (membership.role === "admin" && all.filter((m) => m.role === "admin").length === 1) {
      plan.blockedBy.push({ name: organisation.name, slug: organisation.slug });
    }
  }
  return plan;
}

/** What deleting the signed-in account would do, for the confirmation dialog. */
export const accountDeletion = userQuery({
  args: {},
  handler: async (ctx) => {
    const plan = await accountPlanOf(ctx, ctx.userId);
    return { blockedBy: plan.blockedBy, alsoDeleted: plan.alsoDeleted.map((o) => o.name) };
  },
});

export const accountPlan = internalQuery({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => accountPlanOf(ctx, userId),
});

/** The user menu: someone deletes their own account, and Organisations only they belong to. */
export const deleteAccount = userAction({
  args: {},
  handler: async (ctx) => {
    const plan = await ctx.runQuery(internal.deletion.accountPlan, { userId: ctx.userId });
    if (plan.blockedBy.length > 0) throw new ConvexError("LastAdmin");
    for (const organisation of plan.alsoDeleted) {
      await removeOrganisation(ctx, organisation._id, organisation.stripeCustomerId);
    }
    await ctx.runMutation(internal.deletion.forgetUser, { userId: ctx.userId });
  },
});

/** Removes the user's Memberships and their Better Auth user, sessions and sign-in methods. */
export const forgetUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const membership of memberships) await ctx.db.delete(membership._id);
    await deleteAuthRows(ctx, "session", [{ field: "userId", value: userId }]);
    await deleteAuthRows(ctx, "account", [{ field: "userId", value: userId }]);
    await deleteAuthRows(ctx, "user", [{ field: "_id", value: userId }]);
  },
});
