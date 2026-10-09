import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  putToUploadUrl,
  signUp,
  uploadAndExtract,
} from "../test.setup";
import { openApiDocument } from "./openapi";

vi.mock("../lib/http", async (original) => ({
  ...(await original<typeof import("../lib/http")>()),
  http: (await import("../test.setup")).fakeHttp,
}));
vi.mock("../lib/pdfStore", async () => ({
  pdfStore: (await import("../test.setup")).fakePdfStore,
}));
vi.mock("../lib/reader", async () => ({
  reader: (await import("../test.setup")).fakeReader,
}));
vi.mock("../lib/matcher", async () => ({
  matcher: (await import("../test.setup")).fakeMatcher,
}));
vi.mock("../lib/filler", async () => ({
  filler: (await import("../test.setup")).fakeFiller,
}));
vi.mock("../lib/verifier", async () => ({
  verifier: (await import("../test.setup")).fakeVerifier,
}));

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 6).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const workOrderFields = [
  { type: "text" as const, label: "Kenteken", key: "license_plate", required: true },
  {
    type: "list" as const,
    label: "Regels",
    key: "lines",
    required: false,
    fields: [
      { type: "text" as const, label: "Omschrijving", key: "description", required: true },
      { type: "number" as const, label: "Aantal", key: "quantity", required: false },
    ],
  },
];

// A Submission read with one sure value (the plate) and one unsure one (a line's
// quantity), so it lands in Needs Review with Field Values already stored.
const workOrder = {
  reading: { plate: { value: "OR18DH", _pages: [1] }, lines: [{ text: "Remblokken", qty: 2, _pages: [1] }] },
  matches: { license_plate: { path: "plate.value", probability: 0.97 } },
  lists: {
    lines: {
      path: "lines",
      probability: 0.95,
      keys: {
        description: { path: "text", probability: 0.97 },
        quantity: { path: "qty", probability: 0.4 },
      },
    },
  },
  fills: { license_plate: "OR18DH", "lines[0].description": "Remblokken", "lines[0].quantity": 2 },
};

async function organisation(t: Backend, userId: string, name: string) {
  const { user, slug: organisationSlug } = await signUp(t, userId, name);
  const { formId } = await user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: workOrderFields,
  });
  const { key } = await user.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const read = async (submissionId: string, withKey = key) => {
    const response = await t.fetch(`/v1/submissions/${submissionId}`, {
      headers: { Authorization: `Bearer ${withKey}` },
    });
    return { status: response.status, body: await response.json() };
  };
  return { user, organisationSlug, formId, key, read };
}

test("a Submission still being read answers `processing`, with no Payload", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, read } = await organisation(t, "ann", "Acme Fleet");
  const { key, url } = await user.mutation(api.submissions.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(1));
  await user.action(api.submissions.create, { organisationSlug, formId, key, filename: "werkorder.pdf" });
  const submissionId = await t.run(async (ctx) => (await ctx.db.query("submissions").first())!._id);

  const { status, body } = await read(submissionId);

  expect(status).toBe(200);
  expect(body).toEqual({
    id: submissionId,
    form_id: formId,
    state: "processing",
    filename: "werkorder.pdf",
    uploaded_at: "2026-10-06T09:00:00.000Z",
    data_deleted_at: null,
    payload: null,
  });
});

/** Uploads the work order and lets its Extraction run: it lands in Needs Review. */
async function readWorkOrder(t: Backend, org: Awaited<ReturnType<typeof organisation>>) {
  fakePipeline.replay(workOrder);
  return (await uploadAndExtract(t, org.user, org.organisationSlug, org.formId)) as Id<"submissions">;
}

/** Corrects the unsure quantity, then approves. */
async function approve(t: Backend, org: Awaited<ReturnType<typeof organisation>>, submissionId: Id<"submissions">) {
  const quantity = await t.run(async (ctx) =>
    (await ctx.db
      .query("fieldValues")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .collect())!.find((f) => f.key === "quantity")!,
  );
  await org.user.mutation(api.review.correct, {
    organisationSlug: org.organisationSlug,
    fieldValueId: quantity._id,
    value: 3,
  });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  await org.user.mutation(api.review.approve, { organisationSlug: org.organisationSlug, submissionId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

test("Needs Review answers its state and no Field Value anywhere; after Approval the Payload is there", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const submissionId = await readWorkOrder(t, org);

  const before = await org.read(submissionId);

  expect(before.status).toBe(200);
  expect(before.body).toEqual({
    id: submissionId,
    form_id: org.formId,
    state: "needs_review",
    filename: "werkorder.pdf",
    uploaded_at: "2026-10-06T09:00:00.000Z",
    data_deleted_at: null,
    payload: null,
  });
  for (const value of ["OR18DH", "Remblokken", "license_plate", "lines"]) {
    expect(JSON.stringify(before.body)).not.toContain(value);
  }

  await approve(t, org, submissionId);
  const after = await org.read(submissionId);

  expect(after.status).toBe(200);
  expect(after.body).toEqual({
    id: submissionId,
    form_id: org.formId,
    state: "approved",
    filename: "werkorder.pdf",
    uploaded_at: "2026-10-06T09:00:00.000Z",
    data_deleted_at: null,
    payload: {
      event: "submission.approved",
      delivery_id: `sub_${submissionId}`,
      test: false,
      submission: { id: submissionId, filename: "werkorder.pdf", uploaded_at: "2026-10-06T09:00:00.000Z" },
      form: { id: org.formId, version: 1 },
      approval: { mode: "manual", by: "ann", at: "2026-10-06T10:00:00.000Z" },
      data: { license_plate: "OR18DH", lines: [{ description: "Remblokken", quantity: 3 }] },
    },
  });
});

test("the Payload is the envelope an attached Webhook got, apart from its delivery_id", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const { integrationId } = await org.user.mutation(api.integrations.create, {
    organisationSlug: org.organisationSlug,
    name: "ERP",
    url: "https://erp.example.com/in",
    headers: [],
  });
  await org.user.mutation(api.integrations.attach, {
    organisationSlug: org.organisationSlug,
    integrationId,
    formId: org.formId,
  });
  const submissionId = await readWorkOrder(t, org);
  await approve(t, org, submissionId);

  const { body } = await org.read(submissionId);

  expect(fakeHttp.requests).toHaveLength(1);
  const sent = JSON.parse(fakeHttp.requests[0].body);
  expect(body.payload).toEqual({ ...sent, delivery_id: `sub_${submissionId}` });
});

test("delete now: an Approved Submission stays `approved` with no Payload; any other becomes `deleted`", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const approved = await readWorkOrder(t, org);
  await approve(t, org, approved);
  const open = await readWorkOrder(t, org);

  vi.setSystemTime(new Date("2026-10-07T08:00:00Z"));
  for (const submissionId of [approved, open]) {
    await org.user.mutation(api.rejection.remove, { organisationSlug: org.organisationSlug, submissionId });
  }

  const first = await org.read(approved);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ state: "approved", data_deleted_at: "2026-10-07T08:00:00.000Z", payload: null });
  const second = await org.read(open);
  expect(second.body).toMatchObject({ state: "deleted", data_deleted_at: "2026-10-07T08:00:00.000Z", payload: null });
  for (const { body } of [first, second]) expect(JSON.stringify(body)).not.toContain("OR18DH");
});

test("retention: once the data is gone, the answer keeps the state and drops the Payload", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const approved = await readWorkOrder(t, org);
  await approve(t, org, approved);
  const neverApproved = await readWorkOrder(t, org);

  vi.setSystemTime(new Date("2027-12-01T03:00:00Z"));
  await t.mutation(internal.retention.run, {});

  expect((await org.read(approved)).body).toMatchObject({
    state: "approved",
    data_deleted_at: "2027-12-01T03:00:00.000Z",
    payload: null,
  });
  expect((await org.read(neverApproved)).body).toMatchObject({
    state: "deleted",
    data_deleted_at: "2027-12-01T03:00:00.000Z",
    payload: null,
  });
});

test("a Rejected Submission answers `rejected` and a failed Extraction `failed`, both with no Payload", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const rejected = await readWorkOrder(t, org);
  await org.user.mutation(api.rejection.reject, { organisationSlug: org.organisationSlug, submissionId: rejected });
  fakePipeline.failTimes("read", 100);
  await uploadAndExtract(t, org.user, org.organisationSlug, org.formId);
  const failed = await t.run(async (ctx) => (await ctx.db.query("submissions").order("desc").first())!._id);

  expect((await org.read(rejected)).body).toMatchObject({ state: "rejected", payload: null });
  expect((await org.read(failed)).body).toMatchObject({ state: "failed", payload: null });
  expect(JSON.stringify((await org.read(rejected)).body)).not.toContain("OR18DH");
});

test("another Organisation's Submission, or an id that isn't one, is not found", async () => {
  const t = newBackend();
  const ann = await organisation(t, "ann", "Acme Fleet");
  const bob = await organisation(t, "bob", "Bolt Garage");
  const annsSubmission = await readWorkOrder(t, ann);
  await approve(t, ann, annsSubmission);

  for (const id of [annsSubmission, "nonsense", ann.formId]) {
    const { status, body } = await bob.read(id);
    expect(status).toBe(404);
    expect(body).toEqual({
      error: { code: "not_found", message: "There's no Submission with that id in your Organisation." },
    });
  }
  expect((await ann.read(annsSubmission)).status).toBe(200);
  expect((await t.fetch(`/v1/submissions/${annsSubmission}`)).status).toBe(401);
});

test("every answer has exactly the Submission schema's keys, its state is in the documented enum", async () => {
  const t = newBackend();
  const org = await organisation(t, "ann", "Acme Fleet");
  const open = await readWorkOrder(t, org);
  const approved = await readWorkOrder(t, org);
  await approve(t, org, approved);
  const { Submission, Envelope } = openApiDocument.components.schemas;
  const keys = (schema: typeof Submission) => Object.keys(schema.properties ?? {}).sort();

  for (const submissionId of [open, approved]) {
    const { body } = await org.read(submissionId);
    expect(Object.keys(body).sort()).toEqual(keys(Submission));
    expect(Submission.required?.slice().sort()).toEqual(keys(Submission));
    expect(Submission.properties?.state.enum).toContain(body.state);
  }
  expect(Submission.properties?.state.enum).toEqual(["processing", "needs_review", "approved", "rejected", "failed", "no_form", "deleted"]);
  const { body } = await org.read(approved);
  expect(Object.keys(body.payload).sort()).toEqual(keys(Envelope));
  expect(Submission.properties?.payload).toEqual({
    oneOf: [{ $ref: "#/components/schemas/Envelope" }, { type: "null" }],
    description: expect.any(String),
  });
});
