import betterAuthTest from "@convex-dev/better-auth/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  signUp,
  uploadAndExtract,
  type Recording,
} from "./test.setup";

vi.mock("./lib/http", async (original) => ({
  ...(await original<typeof import("./lib/http")>()),
  http: (await import("./test.setup")).fakeHttp,
}));
vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));
vi.mock("./lib/reader", async () => ({
  reader: (await import("./test.setup")).fakeReader,
}));
vi.mock("./lib/matcher", async () => ({
  matcher: (await import("./test.setup")).fakeMatcher,
}));
vi.mock("./lib/filler", async () => ({
  filler: (await import("./test.setup")).fakeFiller,
}));
vi.mock("./lib/verifier", async () => ({
  verifier: (await import("./test.setup")).fakeVerifier,
}));

// A fake Stripe that only knows Subscriptions: which ones run, which were cancelled.
const fake = vi.hoisted(() => {
  const state = { subscriptions: [] as { id: string; customer: string; status: string }[], cancelled: [] as string[] };
  const client = {
    subscriptions: {
      list: async ({ customer }: { customer: string }) => ({
        data: state.subscriptions.filter((s) => s.customer === customer),
      }),
      cancel: async (id: string) => {
        state.cancelled.push(id);
        return { id, status: "canceled" };
      },
    },
  };
  return { state, client };
});
vi.mock("./lib/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/stripe")>()),
  stripe: () => fake.client,
}));

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 })),
  );
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
  fake.state.subscriptions = [];
  fake.state.cancelled = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const invoice: Recording = {
  reading: { invoice: { number: "F-2026-118", total: "1.249,50", _pages: [1] } },
  matches: {
    invoice_number: { path: "invoice.number", probability: 0.97 },
    total: { path: "invoice.total", probability: 0.4 },
  },
  fills: { invoice_number: "F-2026-118", total: 1249.5 },
};

/** An Organisation with a Form, an Integration, a Submission, an API Key, an Invitation and a paid Plan. */
async function busyOrganisation(t: Backend, userId: string, name: string, customer: string) {
  const owner = await signUp(t, userId, name);
  const organisationSlug = owner.slug;
  const { formId } = await owner.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [
      { type: "text", label: "Invoice number", key: "invoice_number", required: true },
      { type: "number", label: "Total", key: "total", required: false },
    ],
  });
  const { integrationId } = await owner.user.mutation(api.integrations.create, {
    organisationSlug,
    name: "Bookkeeping",
    url: "https://books.example.com/in",
    headers: [],
  });
  await owner.user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });
  await owner.user.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  await owner.user.mutation(api.invitations.invite, { organisationSlug, email: "new@example.com", role: "member" });
  fakePipeline.replay(invoice);
  const submissionId = (await uploadAndExtract(t, owner.user, organisationSlug, formId)) as Id<"submissions">;
  const key = await t.run(async (ctx) => (await ctx.db.get(submissionId))!.key);
  const organisationId = await t.run(async (ctx) => {
    const organisation = (await ctx.db
      .query("organisations")
      .withIndex("by_slug", (q) => q.eq("slug", organisationSlug))
      .unique())!;
    await ctx.db.patch(organisation._id, { stripeCustomerId: customer });
    return organisation._id;
  });
  fake.state.subscriptions.push({ id: `sub_${customer}`, customer, status: "active" });
  return { ...owner, organisationSlug, organisationId, key };
}

const TABLES = [
  "topUpPayments",
  "memberships",
  "invitations",
  "forms",
  "formVersions",
  "formProposals",
  "intakeAddresses",
  "intakeEmails",
  "submissions",
  "readings",
  "fieldValues",
  "listValues",
  "integrations",
  "formIntegrations",
  "deliveries",
  "notifications",
  "submissionEvents",
  "uploads",
  "apiKeys",
  "subscriptions",
  "submissionCounts",
] as const;

/** Rows per table that still belong to the Organisation, and whether it exists. */
async function rowsOf(t: Backend, organisationId: Id<"organisations">) {
  return await t.run(async (ctx) => {
    const rows: Record<string, number> = {};
    for (const table of TABLES) {
      const all = (await ctx.db.query(table).collect()) as { organisationId: Id<"organisations"> }[];
      const count = all.filter((row) => row.organisationId === organisationId).length;
      if (count > 0) rows[table] = count;
    }
    return { exists: (await ctx.db.get(organisationId)) !== null, rows };
  });
}

test("an Admin deletes the Organisation: the Plan stops, then every row and PDF goes, and other Organisations stay", async () => {
  const t = newBackend();
  const ann = await busyOrganisation(t, "ann", "Kantoor Noord", "cus_ann");
  const bob = await busyOrganisation(t, "bob", "Kantoor Zuid", "cus_bob");
  await addMembership(t, "cas", ann.organisationSlug, "member");
  const before = await rowsOf(t, ann.organisationId);
  const otherBefore = await rowsOf(t, bob.organisationId);
  expect(Object.keys(before.rows)).toEqual(
    expect.arrayContaining(["memberships", "forms", "submissions", "fieldValues", "integrations", "apiKeys", "invitations"]),
  );

  await ann.user.action(api.deletion.deleteOrganisation, {
    organisationSlug: ann.organisationSlug,
    confirmName: " Kantoor Noord ",
  });
  // Access is gone at once, before the purge runs.
  await expect(ann.user.query(api.organisations.home, { organisationSlug: ann.organisationSlug })).rejects.toThrow(
    "Forbidden",
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fake.state.cancelled).toEqual(["sub_cus_ann"]);
  expect(await rowsOf(t, ann.organisationId)).toEqual({ exists: false, rows: {} });
  expect(fakePdfStore.objects.has(ann.key)).toBe(false);
  expect(fakePdfStore.objects.has(bob.key)).toBe(true);
  const other = await rowsOf(t, bob.organisationId);
  expect(other).toEqual(otherBefore);
});

test("deleting needs the exact name and an Admin: anything else deletes nothing", async () => {
  const t = newBackend();
  const ann = await busyOrganisation(t, "ann", "Kantoor Noord", "cus_ann");
  await addMembership(t, "cas", ann.organisationSlug, "member");
  const before = await rowsOf(t, ann.organisationId);

  await expect(
    ann.user.action(api.deletion.deleteOrganisation, { organisationSlug: ann.organisationSlug, confirmName: "Kantoor" }),
  ).rejects.toThrow("NameMismatch");
  await expect(
    ann.user.action(api.deletion.deleteOrganisation, { organisationSlug: ann.organisationSlug, confirmName: "" }),
  ).rejects.toThrow("NameMismatch");
  const cas = t.withIdentity({ subject: "cas", email: "cas@example.com" });
  await expect(
    cas.action(api.deletion.deleteOrganisation, { organisationSlug: ann.organisationSlug, confirmName: "Kantoor Noord" }),
  ).rejects.toThrow("Forbidden");

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fake.state.cancelled).toEqual([]);
  expect(await rowsOf(t, ann.organisationId)).toEqual(before);
});

/** A real Better Auth user, so deleting the account has a user, session and password to remove. */
async function authUser(t: Backend, email: string) {
  const id = await t.run(async (ctx) => {
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: { name: email, email, emailVerified: true, createdAt: Date.now(), updatedAt: Date.now() },
      },
    })) as { _id: string };
    for (const model of ["session", "account"] as const) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model,
          data:
            model === "session"
              ? { userId: user._id, token: `token-${email}`, expiresAt: Date.now() + 1000, createdAt: Date.now(), updatedAt: Date.now() }
              : { userId: user._id, accountId: user._id, providerId: "credential", password: "hash", createdAt: Date.now(), updatedAt: Date.now() },
        } as never,
      });
    }
    return user._id;
  });
  return id;
}

async function authRowsOf(t: Backend, userId: string) {
  return await t.run(async (ctx) => {
    const count = async (model: "user" | "session" | "account", field: "_id" | "userId") =>
      (
        await ctx.runQuery(components.betterAuth.adapter.findMany, {
          model,
          where: [{ field, value: userId }],
          paginationOpts: { cursor: null, numItems: 10 },
        } as never)
      ).page.length;
    return { user: await count("user", "_id"), session: await count("session", "userId"), account: await count("account", "userId") };
  });
}

test("deleting your account takes the Organisations only you belong to, leaves the others, and removes your sign-in", async () => {
  const t = newBackend();
  betterAuthTest.register(t, "betterAuth");
  const annId = await authUser(t, "ann@example.com");
  const own = await busyOrganisation(t, annId, "Kantoor Noord", "cus_ann");
  const shared = await signUp(t, "bob", "Kantoor Zuid");
  await addMembership(t, annId, shared.slug, "member");
  const ann = t.withIdentity({ subject: annId, email: "ann@example.com" });

  expect(await ann.query(api.deletion.accountDeletion, {})).toEqual({ blockedBy: [], alsoDeleted: ["Kantoor Noord"] });
  await ann.action(api.deletion.deleteAccount, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await rowsOf(t, own.organisationId)).toEqual({ exists: false, rows: {} });
  expect(fake.state.cancelled).toEqual(["sub_cus_ann"]);
  const sharedMembers = await t.run(async (ctx) => (await ctx.db.query("memberships").collect()).map((m) => m.userId));
  expect(sharedMembers).toEqual(["bob"]);
  const organisations = await t.run(async (ctx) => (await ctx.db.query("organisations").collect()).map((o) => o.name));
  expect(organisations).toEqual(["Kantoor Zuid"]);
  expect(await authRowsOf(t, annId)).toEqual({ user: 0, session: 0, account: 0 });
});

test("the last Admin of an Organisation with other Members can't delete their account until someone else is Admin", async () => {
  const t = newBackend();
  betterAuthTest.register(t, "betterAuth");
  const annId = await authUser(t, "ann@example.com");
  const { slug } = await signUp(t, annId, "Kantoor Noord");
  await addMembership(t, "cas", slug, "member");
  const ann = t.withIdentity({ subject: annId, email: "ann@example.com" });

  expect(await ann.query(api.deletion.accountDeletion, {})).toEqual({
    blockedBy: [{ name: "Kantoor Noord", slug }],
    alsoDeleted: [],
  });
  await expect(ann.action(api.deletion.deleteAccount, {})).rejects.toThrow("LastAdmin");
  expect(await authRowsOf(t, annId)).toEqual({ user: 1, session: 1, account: 1 });

  await addMembership(t, "dee", slug, "admin");
  await ann.action(api.deletion.deleteAccount, {});
  expect(await authRowsOf(t, annId)).toEqual({ user: 0, session: 0, account: 0 });
});
