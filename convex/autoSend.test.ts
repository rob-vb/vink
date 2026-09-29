import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  fakeHttp,
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
  putToUploadUrl,
  signUp,
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

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 1).toString("base64"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakeHttp.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const clean: Recording = {
  reading: { vehicle: { licensePlate: "OR18DH", mileage: "229546", _pages: [1] } },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.97 },
    mileageKm: { path: "vehicle.mileage", probability: 0.94 },
  },
  fills: { licensePlate: "OR18DH", mileageKm: 229546 },
};

async function acme(t: Backend, autoSend: boolean, requiredPlate = true) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: requiredPlate },
      { type: "number", label: "Km", key: "mileageKm", required: false },
    ],
  });
  await ann.user.mutation(api.forms.updateSettings, {
    organisationSlug,
    formId,
    reviewThreshold: 0.8,
    autoSend,
  });
  const upload = async (recording: Recording) => {
    fakePipeline.replay(recording);
    const { key, url } = await ann.user.mutation(api.documents.generateUploadUrl, { organisationSlug });
    putToUploadUrl(url, await pdfWithPages(1));
    await ann.user.action(api.documents.create, { organisationSlug, formId, key, filename: "werkorder.pdf" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const documentId = await t.run(
      async (ctx) => (await ctx.db.query("documents").order("desc").first())!._id,
    );
    const on = { organisationSlug, documentId };
    return { on, read: () => ann.user.query(api.documents.get, on) };
  };
  return { ...ann, organisationSlug, formId, upload };
}

test("a clean, Jev-verified Document on a Form with Auto-Send on is approved automatically", async () => {
  const t = newBackend();
  const { user, organisationSlug, upload } = await acme(t, true);

  const { read } = await upload(clean);

  const document = await read();
  expect(document.state).toBe("approved");
  expect(document.approval).toMatchObject({ mode: "auto", by: null });
  expect(document.history.at(-1)).toMatchObject({ event: "approved", by: "Vink", detail: "Auto-Send" });
  const { documents } = await user.query(api.documents.list, { organisationSlug, state: "approved" });
  expect(documents).toEqual([expect.objectContaining({ approvalMode: "auto" })]);
});

test("an automatic Approval sends to the attached Integrations", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, upload } = await acme(t, true);
  const { integrationId } = await user.mutation(api.integrations.create, {
    organisationSlug,
    name: "Fleet",
    url: "https://fleet.example.com/in",
    headers: [],
  });
  await user.mutation(api.integrations.attach, { organisationSlug, integrationId, formId });

  const { read } = await upload(clean);

  expect((await read()).deliveries).toEqual([expect.objectContaining({ state: "delivered" })]);
  expect(JSON.parse(fakeHttp.requests[0].body).approval).toMatchObject({ mode: "auto", by: null });
});

test.each([
  ["Auto-Send is off", false, clean],
  [
    "something is Needs Review",
    true,
    { ...clean, matches: { ...clean.matches, mileageKm: { path: "vehicle.mileage", probability: 0.5 } } },
  ],
])("no Auto-Send when %s", async (_, autoSend, recording) => {
  const t = newBackend();
  const { upload } = await acme(t, autoSend);

  const { read } = await upload(recording);

  expect((await read()).state).toBe("needs_review");
});

test("no Auto-Send when Jev didn't verify the Document", async () => {
  const t = newBackend();
  const { upload } = await acme(t, true);
  fakePipeline.failOnce("verify");

  const { read } = await upload(clean);

  const document = await read();
  expect(document.jevVerified).toBe(false);
  expect(document.state).toBe("needs_review");
});

test("no Auto-Send when the Document doesn't fit the Form", async () => {
  const t = newBackend();
  // No required Fields, so an empty Reading leaves nothing Needs Review.
  const { upload } = await acme(t, true, false);

  const { read } = await upload({ reading: {}, matches: {}, fills: {} });

  const document = await read();
  expect(document.doesNotFit).toBe(true);
  expect(document.needsReviewCount).toBe(0);
  expect(document.state).toBe("needs_review");
});

test("no Auto-Send when a user touched the Document: Change Form re-runs without it", async () => {
  const t = newBackend();
  const { user, organisationSlug, upload } = await acme(t, true);
  const { formId: other } = await user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order v2",
    fields: [{ type: "text", label: "Kenteken", key: "licensePlate", required: true }],
  });
  await user.mutation(api.forms.updateSettings, {
    organisationSlug,
    formId: other,
    reviewThreshold: 0.8,
    autoSend: true,
  });
  const { on, read } = await upload({
    ...clean,
    matches: { ...clean.matches, mileageKm: { path: "vehicle.mileage", probability: 0.5 } },
  });

  await user.mutation(api.changeForm.changeForm, { ...on, formId: other as Id<"forms"> });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const document = await read();
  expect(document).toMatchObject({ formName: "Work order v2", needsReviewCount: 0, userTouched: true });
  expect(document.state).toBe("needs_review");
});

test("Auto-Send is evaluated once: turning it on or checking values later approves nothing", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, upload } = await acme(t, false);
  const { on, read } = await upload({
    ...clean,
    matches: { ...clean.matches, mileageKm: { path: "vehicle.mileage", probability: 0.5 } },
  });

  await user.mutation(api.forms.updateSettings, { organisationSlug, formId, reviewThreshold: 0.8, autoSend: true });
  const mileageKm = (await read()).fieldValues.find((f) => f.key === "mileageKm")!;
  await user.mutation(api.review.check, { organisationSlug, fieldValueId: mileageKm.id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await read()).state).toBe("needs_review");
  expect(on.documentId).toBeDefined();
});

test("a successful manual retry is evaluated for Auto-Send", async () => {
  const t = newBackend();
  const { user, upload } = await acme(t, true);
  fakePipeline.failTimes("read", 4);
  const { on, read } = await upload(clean);
  expect((await read()).state).toBe("extraction_failed");

  await user.mutation(api.extraction.retry, on);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await read()).approval).toMatchObject({ mode: "auto" });
});
