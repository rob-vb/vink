import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
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
  fakePdfStore.objects.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// An invoice uploaded against the work order Form: only 1 of its 3 required
// Fields matched. On the invoice Form, both of its Fields match.
const invoice: Recording = {
  reading: {
    supplier: { name: "Vianor", vatNumber: "BE0884257344", _pages: [1] },
    totals: { inclVat: "293,82", _pages: [1] },
    vehicle: { licensePlate: "OR18DH", _pages: [1] },
  },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.9 },
    orderNumber: { path: null, probability: 0.9 },
    mileageKm: { path: null, probability: 0.9 },
    supplierName: { path: "supplier.name", probability: 0.97 },
    totalInclVat: { path: "totals.inclVat", probability: 0.95 },
  },
  fills: { licensePlate: "OR18DH", supplierName: "Vianor", totalInclVat: 293.82 },
};

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId: workOrderForm } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      { type: "text", label: "Werkorder", key: "orderNumber", required: true },
      { type: "number", label: "Kilometerstand", key: "mileageKm", required: true },
    ],
  });
  const { formId: invoiceForm } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [
      { type: "text", label: "Leverancier", key: "supplierName", required: true },
      { type: "number", label: "Totaal", key: "totalInclVat", required: true },
    ],
  });
  return { ...ann, workOrderForm, invoiceForm };
}

async function uploadTo(t: Backend, user: Awaited<ReturnType<typeof acme>>["user"], organisationSlug: string, formId: Id<"forms">) {
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(1));
  await user.action(api.documents.create, { organisationSlug, formId, key, filename: "factuur.pdf" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const documentId = await t.run(
    async (ctx) => (await ctx.db.query("documents").order("desc").first())!._id,
  );
  const on = { organisationSlug, documentId };
  return { documentId, on, read: () => user.query(api.documents.get, on) };
}

async function uploadedAgainstWorkOrder(recording: Recording = invoice) {
  const t = newBackend();
  const acmeOrg = await acme(t);
  fakePipeline.replay(recording);
  const upload = await uploadTo(t, acmeOrg.user, acmeOrg.slug, acmeOrg.workOrderForm);
  return { t, ...acmeOrg, ...upload };
}

test("a Document is flagged \"Does not fit this Form\" when fewer than half of the required Fields matched", async () => {
  const { read } = await uploadedAgainstWorkOrder();

  expect((await read()).doesNotFit).toBe(true);
});

test("a Document isn't flagged when at least half of the required Fields matched", async () => {
  const { read } = await uploadedAgainstWorkOrder({
    ...invoice,
    matches: { ...invoice.matches, mileageKm: { path: "vehicle.licensePlate", probability: 0.3 } },
  });

  expect((await read()).doesNotFit).toBe(false);
});

test("a Document is flagged when its Reading is empty", async () => {
  const { read } = await uploadedAgainstWorkOrder({ reading: {}, matches: {}, fills: {} });

  expect((await read()).doesNotFit).toBe(true);
});

test("the cut-off comes from configuration", async () => {
  vi.stubEnv("DOES_NOT_FIT_CUTOFF", "0.3");

  const { read } = await uploadedAgainstWorkOrder();

  expect((await read()).doesNotFit).toBe(false);
});

test("before Change Form, the user learns how many corrections will be lost", async () => {
  const { user, on, read } = await uploadedAgainstWorkOrder();
  const [licensePlate, orderNumber] = (await read()).fieldValues;
  await user.mutation(api.review.correct, { organisationSlug: on.organisationSlug, fieldValueId: orderNumber.id, value: "WO-1" });
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: licensePlate.id });

  expect(await user.query(api.changeForm.impact, on)).toEqual({ corrections: 1 });
});

test("Change Form drops the old values and corrections and runs Match, Fill and Verify again on the stored Reading", async () => {
  const { t, user, on, read, invoiceForm } = await uploadedAgainstWorkOrder();
  const [, orderNumber] = (await read()).fieldValues;
  await user.mutation(api.review.correct, { organisationSlug: on.organisationSlug, fieldValueId: orderNumber.id, value: "WO-1" });
  fakePipeline.calls = [];

  await user.mutation(api.changeForm.changeForm, { ...on, formId: invoiceForm });
  expect((await read()).state).toBe("extracting");
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["match", "fill", "verify"]);
  const document = await read();
  expect(document).toMatchObject({
    state: "needs_review",
    formName: "Invoice",
    formVersion: 1,
    doesNotFit: false,
    userTouched: true,
  });
  expect(document.fieldValues.map((f) => [f.key, f.value, f.review])).toEqual([
    ["supplierName", "Vianor", null],
    ["totalInclVat", 293.82, null],
  ]);
  expect(document.history.map((h) => h.event)).toContain("form_changed");
  expect(document.history.find((h) => h.event === "form_changed")!.detail).toBe("Work order → Invoice");
});

test("Change Form from Extraction Failed with no Reading runs a full Extraction", async () => {
  const t = newBackend();
  const { user, slug, workOrderForm, invoiceForm } = await acme(t);
  fakePipeline.replay(invoice);
  fakePipeline.failTimes("read", 4);
  const { on, read } = await uploadTo(t, user, slug, workOrderForm);
  expect((await read()).state).toBe("extraction_failed");
  fakePipeline.calls = [];

  await user.mutation(api.changeForm.changeForm, { ...on, formId: invoiceForm });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "fill", "verify"]);
  expect((await read()).state).toBe("needs_review");
});

test("Change Form is refused after Approval", async () => {
  const { user, on, read, invoiceForm } = await uploadedAgainstWorkOrder({
    ...invoice,
    matches: {
      ...invoice.matches,
      orderNumber: { path: "supplier.vatNumber", probability: 0.9 },
      mileageKm: { path: "totals.inclVat", probability: 0.9 },
    },
    fills: { ...invoice.fills, orderNumber: "X", mileageKm: 1 },
  });
  expect((await read()).needsReviewCount).toBe(0);
  await user.mutation(api.review.approve, on);

  await expect(
    user.mutation(api.changeForm.changeForm, { ...on, formId: invoiceForm }),
  ).rejects.toThrow("This Document is approved");
});

test("a Document can't be moved to its own Form or another Organisation's", async () => {
  const { t, user, on, workOrderForm } = await uploadedAgainstWorkOrder();
  const eve = await signUp(t, "eve", "Evil Corp");
  const { formId: eveForm } = await eve.user.mutation(api.forms.create, {
    organisationSlug: eve.slug,
    name: "Evil",
    fields: [{ type: "text", label: "X", key: "x", required: false }],
  });

  await expect(
    user.mutation(api.changeForm.changeForm, { ...on, formId: workOrderForm }),
  ).rejects.toThrow("already");
  await expect(user.mutation(api.changeForm.changeForm, { ...on, formId: eveForm })).rejects.toThrow(
    "Form not found",
  );
});
