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
  matches: { invoiceNumber: { path: "invoice.number", probability: 0.97 } },
  fills: { invoiceNumber: "F-2026-118" },
  proposal: [
    {
      field: { type: "text", label: "Invoice number", key: "invoiceNumber", required: false },
      ticked: true,
    },
  ],
};

/** A new sign-up: Ann and her Organisation, on its Free Pages only, with one Form. */
async function freshSignUp(t: Backend) {
  const ann = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoiceNumber", required: true }],
  });
  return { ...ann, formId };
}

async function upload(user: User, organisationSlug: string, formId: Id<"forms">, pages: number) {
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(pages));
  await user.action(api.documents.create, {
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
  return user.query(api.pages.usage, { organisationSlug });
}

async function documentCount(t: Backend) {
  return await t.run(async (ctx) => (await ctx.db.query("documents").collect()).length);
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

test("the first Organisation a user creates gets 20 Free Pages and no Plan", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);

  expect(await usage(user, slug)).toMatchObject({
    plan: null,
    unlimited: false,
    remaining: 20,
    freePages: 20,
    resetsAt: null,
    warning: false,
  });
});

test("an Organisation created by someone who already created one gets no Free Pages", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  // Ann leaves her Organisation, then starts another one.
  await t.run(async (ctx) => {
    for (const m of await ctx.db.query("memberships").collect()) await ctx.db.delete(m._id);
  });
  const again = await signUp(t, "ann", "Kantoor Zuid", { plan: null });

  expect(again.slug).not.toBe(slug);
  expect(await usage(again.user, again.slug)).toMatchObject({ remaining: 0, freePages: 0 });
});

test("an invited Member gets no Free Pages of their own", async () => {
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

test("a Document's Pages are charged once, when Vink accepts its PDF", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);

  await upload(user, slug, formId, 3);
  await upload(user, slug, formId, 5);

  expect(await usage(user, slug)).toMatchObject({ remaining: 12, freePages: 12, used: 8 });
});

test("a PDF that doesn't fit the remaining Pages is refused whole", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  await upload(user, slug, formId, 17);

  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(8));
  const data = await refusal(
    user.action(api.documents.create, { organisationSlug: slug, formId, key, filename: "8.pdf" }),
  );

  expect(data).toEqual({
    code: "out_of_pages",
    message: "You have 3 pages left; this PDF has 8.",
    remaining: 3,
    needed: 8,
  });
  expect(await documentCount(t)).toBe(1);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await usage(user, slug)).toMatchObject({ remaining: 3 });
});

test("with the Pages gone, Documents already accepted can still be approved", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  await upload(user, slug, formId, 20);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const { documents } = await user.query(api.documents.list, {
    organisationSlug: slug,
    state: "needs_review",
  });
  const documentId = documents[0].id;

  await refusal(upload(user, slug, formId, 1));
  const [fieldValue] = (
    await user.query(api.documents.get, { organisationSlug: slug, documentId })
  ).fieldValues;
  await user.mutation(api.review.check, { organisationSlug: slug, fieldValueId: fieldValue.id });
  await user.mutation(api.review.approve, { organisationSlug: slug, documentId });

  expect(
    (await user.query(api.documents.get, { organisationSlug: slug, documentId })).state,
  ).toBe("approved");
});

test("a Form Proposal's sample is charged, and becoming the first Document costs nothing more", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
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
    fields: [{ type: "text", label: "Invoice number", key: "invoiceNumber", required: true }],
    processSample: true,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await documentCount(t)).toBe(1);
  expect(await usage(user, slug)).toMatchObject({ remaining: 16 });
});

test("a sample that doesn't fit is refused whole and leaves no Form Proposal", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Kantoor Noord", { plan: null });
  const oid = await organisationId(t, slug);
  await t.mutation(internal.pages.setFreePages, { organisationId: oid, freePages: 2 });
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
    organisationSlug: slug,
  });
  putToUploadUrl(url, await pdfWithPages(4));

  const data = await refusal(
    user.action(api.formProposals.create, { organisationSlug: slug, key, filename: "s.pdf" }),
  );

  expect(data).toMatchObject({ code: "out_of_pages", remaining: 2, needed: 4 });
  expect(fakePdfStore.objects.has(key)).toBe(false);
  expect(await t.run(async (ctx) => (await ctx.db.query("formProposals").collect()).length)).toBe(
    0,
  );
});

test("a retry after Extraction Failed and a Change Form cost no Pages", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const { formId: otherFormId } = await user.mutation(api.forms.create, {
    organisationSlug: slug,
    name: "Delivery note",
    fields: [{ type: "text", label: "Invoice number", key: "invoiceNumber", required: true }],
  });
  fakePipeline.failTimes("read", 10);
  await upload(user, slug, formId, 2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const documentId = await t.run(async (ctx) => (await ctx.db.query("documents").first())!._id);
  expect((await user.query(api.documents.get, { organisationSlug: slug, documentId })).state).toBe(
    "extraction_failed",
  );

  fakePipeline.failing.clear();
  await user.mutation(api.extraction.retry, { organisationSlug: slug, documentId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await user.mutation(api.changeForm.changeForm, {
    organisationSlug: slug,
    documentId,
    formId: otherFormId,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await usage(user, slug)).toMatchObject({ remaining: 18, used: 2 });
});

test("Free Pages go first, then the Plan's allowance, then Top-ups", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  await t.mutation(internal.pages.setPlan, {
    organisationId: oid,
    plan: "starter",
    allowance: 10,
    periodEndsAt: Date.now() + 30 * DAY,
  });
  await t.mutation(internal.pages.setFreePages, { organisationId: oid, freePages: 2 });
  await t.mutation(internal.pages.addTopUp, { organisationId: oid, pages: 5 });
  expect(await usage(user, slug)).toMatchObject({
    plan: "starter",
    remaining: 17,
    freePages: 2,
    allowanceLeft: 10,
    topUpPages: 5,
  });

  await upload(user, slug, formId, 3);
  expect(await usage(user, slug)).toMatchObject({ freePages: 0, allowanceLeft: 9, topUpPages: 5 });

  await upload(user, slug, formId, 12);
  expect(await usage(user, slug)).toMatchObject({
    freePages: 0,
    allowanceLeft: 0,
    topUpPages: 2,
    remaining: 2,
  });
});

test("the warning shows once 80% of the Pages are used", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);

  await upload(user, slug, formId, 15);
  expect(await usage(user, slug)).toMatchObject({ warning: false });

  await upload(user, slug, formId, 1);
  expect(await usage(user, slug)).toMatchObject({ remaining: 4, warning: true });
});

test("at the reset date the allowance renews, unused Pages and Top-ups expire", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  const resetsAt = Date.now() + 10 * DAY;
  await t.mutation(internal.pages.setFreePages, { organisationId: oid, freePages: 0 });
  await t.mutation(internal.pages.setPlan, {
    organisationId: oid,
    plan: "team",
    allowance: 100,
    periodEndsAt: resetsAt,
  });
  await t.mutation(internal.pages.addTopUp, { organisationId: oid, pages: 50 });
  await upload(user, slug, formId, 20);
  expect(await usage(user, slug)).toMatchObject({ remaining: 130, resetsAt });

  vi.setSystemTime(resetsAt + 1000);
  await t.mutation(internal.pages.advancePeriods, {});

  expect(await usage(user, slug)).toMatchObject({
    allowanceLeft: 100,
    topUpPages: 0,
    remaining: 100,
    used: 0,
    resetsAt: new Date("2026-11-11T09:00:00Z").getTime(),
  });
});

test("the internal unlimited Plan never refuses and never shows a count", async () => {
  const t = newBackend();
  const { user, slug, formId } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  await t.mutation(internal.pages.setPlan, {
    organisationId: oid,
    plan: "internal_unlimited",
    allowance: 0,
    periodEndsAt: null,
  });

  for (let i = 0; i < 3; i++) await upload(user, slug, formId, 20);

  expect(await documentCount(t)).toBe(3);
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

  const { migrated } = await t.mutation(internal.pages.migrateExistingToUnlimited, {});

  expect(migrated).toBe(1);
  const owner = t.withIdentity({ subject: "owner", email: "owner@example.com" });
  expect(await usage(owner, "test-bv")).toMatchObject({
    plan: "internal_unlimited",
    unlimited: true,
  });
  expect(legacyId).toBeDefined();
});

test("Members see the remaining Pages; Plans are only set internally", async () => {
  const t = newBackend();
  const { slug } = await freshSignUp(t);
  const cas = await addMembership(t, "cas", slug, "member");

  // Plans, allowances, Top-ups and Free Pages change only through internal
  // functions (setPlan, addTopUp, setFreePages), which no user can call.
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
    "This PDF has 21 pages. Vink reads up to 20 pages per Document.",
    "created",
    "You have 6 pages left; this PDF has 9.",
    "created",
  ]);
  expect(await documentCount(t)).toBe(3);
  expect(await usage(user, slug)).toMatchObject({ remaining: 4 });
});

test("a period ending on the 31st keeps its day: Jan 31, Feb 28, Mar 31", async () => {
  const t = newBackend();
  const { user, slug } = await freshSignUp(t);
  const oid = await organisationId(t, slug);
  vi.setSystemTime(new Date("2027-01-15T09:00:00Z"));
  await t.mutation(internal.pages.setPlan, {
    organisationId: oid,
    plan: "starter",
    allowance: 300,
    periodEndsAt: new Date("2027-01-31T00:00:00Z").getTime(),
  });

  const resets = [];
  for (const now of ["2027-01-31T01:00:00Z", "2027-02-28T01:00:00Z"]) {
    vi.setSystemTime(new Date(now));
    await t.mutation(internal.pages.advancePeriods, {});
    resets.push(new Date((await usage(user, slug)).resetsAt!).toISOString());
  }

  expect(resets).toEqual(["2027-02-28T00:00:00.000Z", "2027-03-31T00:00:00.000Z"]);
});
