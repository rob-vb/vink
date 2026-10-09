import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  putToUploadUrl,
  signUp,
  type Recording,
} from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));
vi.mock("./lib/reader", async () => ({
  reader: (await import("./test.setup")).fakeReader,
}));
vi.mock("./lib/proposer", async () => ({
  proposer: (await import("./test.setup")).fakeProposer,
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

type Backend = ReturnType<typeof newBackend>;
type User = ReturnType<Backend["withIdentity"]>;

const DAY = 24 * 60 * 60 * 1000;

let sent: { to: string[]; subject: string; html: string }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakePipeline.replay(invoice);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const invoice: Recording = {
  reading: { invoice: { number: "F-2026-118", _pages: [1] } },
  matches: { invoice_number: { path: "invoice.number", probability: 0.97 } },
  fills: { invoice_number: "F-2026-118" },
  proposal: [
    {
      field: { type: "text", label: "Invoice number", key: "invoice_number", required: false },
      ticked: true,
    },
  ],
};

/** A new sign-up: Ann and her Organisation, on its Free Items only, with one Form. */
async function freshSignUp(t: Backend) {
  const ann = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  return { ...ann, formId };
}

async function upload(user: User, organisationSlug: string, formId: Id<"forms">, pages: number) {
  const { key, url } = await user.mutation(api.submissions.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(pages));
  await user.action(api.submissions.create, {
    organisationSlug,
    formId,
    key,
    filename: `scan-${pages}.pdf`,
  });
  return key;
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<{ code: string; message: string; remaining: number; needed: number }>)
    .data;
}

function usage(user: User, organisationSlug: string) {
  return user.query(api.items.usage, { organisationSlug });
}

async function submissionCount(t: Backend) {
  return await t.run(async (ctx) => (await ctx.db.query("submissions").collect()).length);
}

async function organisationId(t: Backend, slug: string) {
  return await t.run(
    async (ctx) =>
      (await ctx.db
        .query("organisations")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique())!._id,
  );
}

test("the first Organisation a user creates gets 20 Free Items and no Plan", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  expect(await usage(user, slug)).toMatchObject({
    plan: null,
    unlimited: false,
    remaining: 20,
    freeItems: 20,
    resetsAt: null,
    warning: false,
  });
});

test("an Organisation created by someone who already created one gets no Free Items", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  // Ann leaves her Organisation, then starts another one.
  await t.run(async (ctx) => {
    for (const m of await ctx.db.query("memberships").collect()) await ctx.db.delete(m._id);
  });
  const again = await signUp(t, "ann", "Kantoor Zuid", { plan: null });

  expect(again.slug).not.toBe(slug);
  expect(await usage(again.user, again.slug)).toMatchObject({ remaining: 0, freeItems: 0 });
});

test("an invited Member gets no Free Items of their own", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  const cas = await addMembership(t, "cas", slug, "member");

  // Finishing sign-up with a Membership returns that Organisation, not a new one.
  const { slug: casSlug } = await cas.mutation(api.onboarding.createOrganisation, {
    name: "Cas BV",
  });
  expect(casSlug).toBe(slug);
  expect(await usage(cas, slug)).toMatchObject({ remaining: 20 });
});

test("a Submission's Items are charged once, when Vink accepts its PDF", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);

  await upload(user, slug, formId, 3);
  await upload(user, slug, formId, 5);

  expect(await usage(user, slug)).toMatchObject({ remaining: 12, freeItems: 12, used: 8 });
});

test("a PDF that doesn't fit the remaining Items is refused whole", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  await upload(user, slug, formId, 17);

  const { key, url } = await user.mutation(api.submissions.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(8));
  const data = await refusal(
    user.action(api.submissions.create, { organisationSlug: slug, formId, key, filename: "8.pdf" }),
  );

  expect(data).toEqual({
    code: "out_of_items",
    message: "You have 3 items left; this PDF needs 8.",
    remaining: 3,
    needed: 8,
  });
  expect(await submissionCount(t)).toBe(1);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await usage(user, slug)).toMatchObject({ remaining: 3 });
});

test("with the Items gone, Submissions already accepted can still be approved", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  await upload(user, slug, formId, 20);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const { submissions } = await user.query(api.submissions.list, {
    organisationSlug: slug,
    state: "needs_review",
  });
  const submissionId = submissions[0].id;

  await refusal(upload(user, slug, formId, 1));
  const [fieldValue] = (
    await user.query(api.submissions.get, { organisationSlug: slug, submissionId })
  ).fieldValues;
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: fieldValue.id });
  await user.mutation(api.review.approve, { organisationSlug: slug, submissionId });

  expect(
    (await user.query(api.submissions.get, { organisationSlug: slug, submissionId })).state,
  ).toBe("approved");
});

test("a Form Proposal's sample is charged, and becoming the first Submission costs nothing more", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const { key, url } = await user.mutation(api.submissions.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(4));
  const { proposalId } = await user.action(api.formProposals.create, {
    organisationSlug: slug,
    key,
    filename: "sample.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await usage(user, slug)).toMatchObject({ remaining: 16 });

  await user.mutation(api.formProposals.save, {
    organisationSlug: slug,
    proposalId,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
    processSample: true,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await submissionCount(t)).toBe(1);
  expect(await usage(user, slug)).toMatchObject({ remaining: 16 });
});

test("a sample that doesn't fit is refused whole and leaves no Form Proposal", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const oid = await organisationId(t, slug);
  await t.mutation(internal.items.setFreeItems, { organisationId: oid, freeItems: 2 });
  const { key, url } = await user.mutation(api.submissions.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(4));

  const data = await refusal(
    user.action(api.formProposals.create, { organisationSlug: slug, key, filename: "s.pdf" }),
  );

  expect(data).toMatchObject({ code: "out_of_items", remaining: 2, needed: 4 });
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await t.run(async (ctx) => (await ctx.db.query("formProposals").collect()).length)).toBe(
    0,
  );
});

test("a retry after Extraction Failed and a Change Form cost no Items", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const { formId: otherFormId } = await user.mutation(api.forms.create, {
    organisationSlug: slug,
    name: "Delivery note",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  fakePipeline.failTimes("read", 10);
  await upload(user, slug, formId, 2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const submissionId = await t.run(async (ctx) => (await ctx.db.query("submissions").first())!._id);
  expect((await user.query(api.submissions.get, { organisationSlug: slug, submissionId })).state).toBe(
    "extraction_failed",
  );

  fakePipeline.failing.clear();
  await user.mutation(api.extraction.retry, { organisationSlug: slug, submissionId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await user.mutation(api.changeForm.changeForm, {
    organisationSlug: slug,
    submissionId,
    formId: otherFormId,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await usage(user, slug)).toMatchObject({ remaining: 18, used: 2 });
});

test("Free Items go first, then the Plan's allowance, then Top-ups", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  await t.mutation(internal.items.setPlan, {
    organisationId: oid,
    plan: "starter",
    allowance: 10,
    periodEndsAt: Date.now() + 30 * DAY,
  });
  await t.mutation(internal.items.setFreeItems, { organisationId: oid, freeItems: 2 });
  await t.mutation(internal.items.addTopUp, { organisationId: oid, items: 5 });
  expect(await usage(user, slug)).toMatchObject({
    plan: "starter",
    remaining: 17,
    freeItems: 2,
    allowanceLeft: 10,
    topUpItems: 5,
  });

  await upload(user, slug, formId, 3);
  expect(await usage(user, slug)).toMatchObject({ freeItems: 0, allowanceLeft: 9, topUpItems: 5 });

  await upload(user, slug, formId, 12);
  expect(await usage(user, slug)).toMatchObject({
    freeItems: 0,
    allowanceLeft: 0,
    topUpItems: 2,
    remaining: 2,
  });
});

test("the warning shows once 80% of the Items are used", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);

  await upload(user, slug, formId, 15);
  expect(await usage(user, slug)).toMatchObject({ warning: false });

  await upload(user, slug, formId, 1);
  expect(await usage(user, slug)).toMatchObject({ remaining: 4, warning: true });
});

test("at the reset date the allowance renews, unused Items and Top-ups expire", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  const resetsAt = Date.now() + 10 * DAY;
  await t.mutation(internal.items.setFreeItems, { organisationId: oid, freeItems: 0 });
  await t.mutation(internal.items.setPlan, {
    organisationId: oid,
    plan: "team",
    allowance: 100,
    periodEndsAt: resetsAt,
  });
  await t.mutation(internal.items.addTopUp, { organisationId: oid, items: 50 });
  await upload(user, slug, formId, 20);
  expect(await usage(user, slug)).toMatchObject({ remaining: 130, resetsAt });

  vi.setSystemTime(resetsAt + 1000);
  await t.mutation(internal.items.advancePeriods, {});

  expect(await usage(user, slug)).toMatchObject({
    allowanceLeft: 100,
    topUpItems: 0,
    remaining: 100,
    used: 0,
    resetsAt: new Date("2026-11-11T09:00:00Z").getTime(),
  });
});

test("the internal unlimited Plan never refuses and never shows a count", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  await t.mutation(internal.items.setPlan, {
    organisationId: oid,
    plan: "internal_unlimited",
    allowance: 0,
    periodEndsAt: null,
  });

  for (let i = 0; i < 3; i++) await upload(user, slug, formId, 20);

  expect(await submissionCount(t)).toBe(3);
  expect(await usage(user, slug)).toMatchObject({
    plan: "internal_unlimited",
    unlimited: true,
    remaining: null,
    warning: false,
  });
});

test("existing Organisations move to the internal unlimited Plan", async () => {
  const t = newBackend();
  const legacyId = await t.run(async (ctx) => {
    const organisationId = await ctx.db.insert("organisations", {
      name: "Test BV",
      slug: "test-bv",
    });
    await ctx.db.insert("memberships", { organisationId, userId: "owner", role: "admin" });
    return organisationId;
  });

  const { migrated } = await t.mutation(internal.items.migrateExistingToUnlimited, {});

  expect(migrated).toBe(1);
  const owner = t.withIdentity({ subject: "owner", email: "owner@example.com" });
  expect(await usage(owner, "test-bv")).toMatchObject({
    plan: "internal_unlimited",
    unlimited: true,
  });
  expect(legacyId).toBeDefined();
});

test("Members see the remaining Items; Plans are only set internally", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  const cas = await addMembership(t, "cas", slug, "member");

  // Plans, allowances, Top-ups and Free Items change only through internal
  // functions (setPlan, addTopUp, setFreeItems), which no user can call.
  expect(await usage(cas, slug)).toMatchObject({ remaining: 20 });
});

test("Vink is emailed about every new Organisation, with the email domain", async () => {
  vi.stubEnv("SIGNUP_NOTIFY_TO", "team@vink.test");
  const t = newBackend();
  await t.withIdentity({ subject: "ann", email: "ann@kantoornoord.nl" }).mutation(
    api.onboarding.createOrganisation,
    { name: "Kantoor Noord" },
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const mail = sent.find((m) => m.to.includes("team@vink.test"));
  expect(mail?.subject).toContain("Kantoor Noord");
  expect(mail?.html).toContain("kantoornoord.nl");
});

test("several PDFs uploaded at once: a refused one never blocks the others", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const outcomes = [];
  for (const pages of [4, 21, 10, 9, 2]) {
    outcomes.push(
      await upload(user, slug, formId, pages).then(
        () => "created",
        (e: ConvexError<string | { message: string }>) =>
          typeof e.data === "string" ? e.data : e.data.message,
      ),
    );
  }

  expect(outcomes).toEqual([
    "created",
    "This PDF has 21 pages. Vink reads up to 20 pages per PDF.",
    "created",
    "You have 6 items left; this PDF needs 9.",
    "created",
  ]);
  expect(await submissionCount(t)).toBe(3);
  expect(await usage(user, slug)).toMatchObject({ remaining: 4 });
});

test("a period ending on the 31st keeps its day: Jan 31, Feb 28, Mar 31", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  vi.setSystemTime(new Date("2027-01-15T09:00:00Z"));
  await t.mutation(internal.items.setPlan, {
    organisationId: oid,
    plan: "starter",
    allowance: 300,
    periodEndsAt: new Date("2027-01-31T00:00:00Z").getTime(),
  });

  const resets = [];
  for (const now of ["2027-01-31T01:00:00Z", "2027-02-28T01:00:00Z"]) {
    vi.setSystemTime(new Date(now));
    await t.mutation(internal.items.advancePeriods, {});
    resets.push(new Date((await usage(user, slug)).resetsAt!).toISOString());
  }

  expect(resets).toEqual(["2027-02-28T00:00:00.000Z", "2027-03-31T00:00:00.000Z"]);
});

// The Page → Item rename (ADR 0010) is widen → backfill → narrow. These tests
// cover the widen and backfill steps with a "dev copy": Organisations whose
// state still sits under the old field names.
// TODO(narrow): delete everything below with the old fields.

type OldItems = {
  plan: "starter" | "team" | null;
  allowance: number;
  allowanceUsed: number;
  periodEndsAt: number | null;
  anchorDay?: number;
  topUp: number;
  free: number;
  used: number;
};

const OLD_TEAM: OldItems = {
  plan: "team",
  allowance: 1000,
  allowanceUsed: 400,
  periodEndsAt: Date.parse("2026-10-20T00:00:00Z"),
  anchorDay: 20,
  topUp: 0,
  free: 0,
  used: 400,
};
const OLD_FREE_ONLY: OldItems = {
  plan: null,
  allowance: 0,
  allowanceUsed: 0,
  periodEndsAt: null,
  topUp: 0,
  free: 12,
  used: 8,
};
const OLD_TOP_UP: OldItems = {
  plan: "starter",
  allowance: 300,
  allowanceUsed: 100,
  periodEndsAt: Date.parse("2026-10-15T00:00:00Z"),
  anchorDay: 15,
  topUp: 100,
  free: 5,
  used: 100,
};

/** An Organisation as prod has it before the backfill: Items under `pages`, or nothing at all. */
async function seedOld(t: Backend, slug: string, pages: OldItems | null) {
  return await t.run(async (ctx) => {
    const organisationId = await ctx.db.insert("organisations", {
      name: slug,
      slug,
      ...(pages ? { pages } : {}),
    });
    await ctx.db.insert("memberships", { organisationId, userId: slug, role: "admin" });
    return organisationId;
  });
}

function owner(t: Backend, slug: string) {
  return t.withIdentity({ subject: slug, email: `${slug}@example.com` });
}

const SEEDS = { team: OLD_TEAM, "free-only": OLD_FREE_ONLY, "top-up": OLD_TOP_UP, none: null };

async function seedDevCopy(t: Backend) {
  const ids = {} as Record<keyof typeof SEEDS, Id<"organisations">>;
  for (const [slug, pages] of Object.entries(SEEDS)) {
    ids[slug as keyof typeof SEEDS] = await seedOld(t, slug, pages);
  }
  // An Organisation that was already written under the new name, with other numbers.
  await t.run(async (ctx) => {
    const organisationId = await ctx.db.insert("organisations", {
      name: "new",
      slug: "new",
      items: { ...OLD_FREE_ONLY, free: 3, used: 17 },
    });
    await ctx.db.insert("memberships", { organisationId, userId: "new", role: "admin" });
  });
  return ids;
}

async function allUsage(t: Backend) {
  const result: Record<string, Awaited<ReturnType<typeof usage>>> = {};
  for (const slug of [...Object.keys(SEEDS), "new"]) result[slug] = await usage(owner(t, slug), slug);
  return result;
}

test("Items still under the old field name are read, and the next write moves them to the new one", async () => {
  const t = newBackend();
  const ids = await seedDevCopy(t);

  expect(await usage(owner(t, "top-up"), "top-up")).toMatchObject({
    plan: "starter",
    remaining: 5 + 200 + 100,
    freeItems: 5,
    allowanceLeft: 200,
    topUpItems: 100,
    used: 100,
  });

  await t.mutation(internal.items.addTopUp, { organisationId: ids["top-up"], items: 50 });

  const stored = await t.run(async (ctx) => (await ctx.db.get(ids["top-up"]))!);
  expect(stored.pages).toBeUndefined();
  expect(stored.items).toEqual({ ...OLD_TOP_UP, topUp: 150 });
});

test("the monthly cron advances an Organisation whose period ended, under the old name or the new", async () => {
  const t = newBackend();
  const ended = Date.parse("2026-09-20T00:00:00Z");
  const oldName = await seedOld(t, "old-name", { ...OLD_TEAM, periodEndsAt: ended });
  const newName = await seedOld(t, "new-name", null);
  await t.run(async (ctx) => {
    await ctx.db.patch(newName, { items: { ...OLD_TEAM, periodEndsAt: ended } });
  });

  await t.mutation(internal.items.advancePeriods, {});

  for (const id of [oldName, newName]) {
    const stored = await t.run(async (ctx) => (await ctx.db.get(id))!);
    expect(stored.pages).toBeUndefined();
    expect(stored.items).toMatchObject({
      allowanceUsed: 0,
      used: 0,
      topUp: 0,
      periodEndsAt: Date.parse("2026-10-20T00:00:00Z"),
    });
  }
});

test("the backfill moves every old field to its new name and every Organisation keeps the same totals", async () => {
  const t = newBackend();
  const ids = await seedDevCopy(t);
  await t.run(async (ctx) => {
    const formId = await ctx.db.insert("forms", {
      organisationId: ids.team,
      name: "Invoice",
      reviewThreshold: 0.8,
      autoSend: false,
      version: 1,
    });
    await ctx.db.insert("intakeAddresses", {
      organisationId: ids.team,
      formId,
      token: "tok-old",
      outOfPagesAlertAt: 1234,
    });
    await ctx.db.insert("intakeAddresses", {
      organisationId: ids.team,
      formId,
      token: "tok-never-alerted",
    });
    await ctx.db.insert("topUpPayments", {
      organisationId: ids["top-up"],
      checkoutSessionId: "cs_old",
      pages: 100,
    });
    await ctx.db.insert("topUpPayments", {
      organisationId: ids["top-up"],
      checkoutSessionId: "cs_new",
      items: 100,
    });
  });
  const before = await allUsage(t);
  // The totals the dev copy should keep, spelled out.
  expect(before.team).toMatchObject({ remaining: 600, used: 400, allowance: 1000, freeItems: 0 });
  expect(before["free-only"]).toMatchObject({ remaining: 12, used: 8, freeItems: 12 });
  expect(before["top-up"]).toMatchObject({ remaining: 305, used: 100, allowanceLeft: 200, topUpItems: 100 });
  expect(before.none).toMatchObject({ unlimited: true, remaining: null });
  expect(before.new).toMatchObject({ remaining: 3, used: 17 });

  const first = await t.action(internal.items.backfillItems, {});

  expect(first).toEqual({ organisations: 3, topUpPayments: 1, intakeAddresses: 1 });
  expect(await allUsage(t)).toEqual(before);
  const stored = await t.run(async (ctx) => ({
    organisations: await ctx.db.query("organisations").collect(),
    topUpPayments: await ctx.db.query("topUpPayments").collect(),
    intakeAddresses: await ctx.db.query("intakeAddresses").collect(),
  }));
  const bySlug = Object.fromEntries(stored.organisations.map((o) => [o.slug, o]));
  expect(bySlug.team.items).toEqual(OLD_TEAM);
  expect(bySlug["free-only"].items).toEqual(OLD_FREE_ONLY);
  expect(bySlug["top-up"].items).toEqual(OLD_TOP_UP);
  // Never had Plans state: stays that way, and still counts as internal unlimited.
  expect(bySlug.none.items).toBeUndefined();
  // Already on the new name: untouched.
  expect(bySlug.new.items).toMatchObject({ free: 3, used: 17 });
  expect(stored.organisations.every((o) => o.pages === undefined)).toBe(true);
  expect(stored.topUpPayments.map((p) => [p.checkoutSessionId, p.items, p.pages])).toEqual([
    ["cs_old", 100, undefined],
    ["cs_new", 100, undefined],
  ]);
  expect(stored.intakeAddresses.map((a) => [a.token, a.outOfItemsAlertAt, a.outOfPagesAlertAt])).toEqual([
    ["tok-old", 1234, undefined],
    ["tok-never-alerted", undefined, undefined],
  ]);

  // Idempotent: a second run finds nothing, and the totals stay.
  expect(await t.action(internal.items.backfillItems, {})).toEqual({
    organisations: 0,
    topUpPayments: 0,
    intakeAddresses: 0,
  });
  expect(await allUsage(t)).toEqual(before);
});

test("the backfill keeps the new field when an Organisation somehow has both", async () => {
  const t = newBackend();
  const id = await seedOld(t, "both", OLD_FREE_ONLY);
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { items: { ...OLD_FREE_ONLY, free: 1, used: 19 } });
  });

  await t.action(internal.items.backfillItems, {});

  const stored = await t.run(async (ctx) => (await ctx.db.get(id))!);
  expect(stored.pages).toBeUndefined();
  expect(stored.items).toMatchObject({ free: 1, used: 19 });
});

test("the backfill walks tables of several pages: every row is filled, the totals are unchanged, a second full run changes nothing", async () => {
  const t = newBackend();
  const ids = await seedDevCopy(t);
  // More old rows than one page of 2 in each table.
  await t.run(async (ctx) => {
    for (let i = 0; i < 5; i++) {
      const organisationId = await ctx.db.insert("organisations", {
        name: `extra-${i}`,
        slug: `extra-${i}`,
        pages: { ...OLD_TOP_UP, free: i, used: i },
      });
      await ctx.db.insert("memberships", { organisationId, userId: `extra-${i}`, role: "admin" });
      await ctx.db.insert("topUpPayments", { organisationId, checkoutSessionId: `cs_old_${i}`, pages: 10 + i });
      const formId = await ctx.db.insert("forms", {
        organisationId,
        name: "Invoice",
        reviewThreshold: 0.8,
        autoSend: false,
        version: 1,
      });
      await ctx.db.insert("intakeAddresses", { organisationId, formId, token: `tok-${i}`, outOfPagesAlertAt: 100 + i });
    }
    // One of each already under the new name: the walk must pass them by.
    await ctx.db.insert("topUpPayments", { organisationId: ids.team, checkoutSessionId: "cs_new", items: 7 });
  });
  const before = await allUsage(t);
  for (let i = 0; i < 5; i++) {
    before[`extra-${i}`] = await usage(owner(t, `extra-${i}`), `extra-${i}`);
  }

  const first = await t.action(internal.items.backfillItems, { numItems: 2 });

  // 3 old Organisations in the dev copy plus 5 extra.
  expect(first).toEqual({ organisations: 8, topUpPayments: 5, intakeAddresses: 5 });
  const slugs = Object.keys(before);
  const totals: typeof before = {};
  for (const slug of slugs) totals[slug] = await usage(owner(t, slug), slug);
  expect(totals).toEqual(before);
  const stored = await t.run(async (ctx) => ({
    organisations: await ctx.db.query("organisations").collect(),
    topUpPayments: await ctx.db.query("topUpPayments").collect(),
    intakeAddresses: await ctx.db.query("intakeAddresses").collect(),
  }));
  expect(stored.organisations.every((o) => o.pages === undefined)).toBe(true);
  expect(stored.topUpPayments.every((p) => p.pages === undefined && p.items !== undefined)).toBe(true);
  expect(stored.intakeAddresses.every((a) => a.outOfPagesAlertAt === undefined)).toBe(true);
  expect(stored.intakeAddresses.map((a) => a.outOfItemsAlertAt).sort()).toEqual([100, 101, 102, 103, 104]);
  expect(stored.topUpPayments.map((p) => p.items).sort((a, b) => a! - b!)).toEqual([7, 10, 11, 12, 13, 14]);

  // A full second run changes nothing, with a page size of 2 and with the default.
  const zeros = { organisations: 0, topUpPayments: 0, intakeAddresses: 0 };
  expect(await t.action(internal.items.backfillItems, { numItems: 2 })).toEqual(zeros);
  expect(await t.action(internal.items.backfillItems, {})).toEqual(zeros);
  const again: typeof before = {};
  for (const slug of slugs) again[slug] = await usage(owner(t, slug), slug);
  expect(again).toEqual(before);
});
