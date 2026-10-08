import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
vi.mock("./lib/router", async () => ({
  router: (await import("./test.setup")).fakeRouter,
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
    vehicle: { license_plate: "OR18DH", _pages: [1] },
  },
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.9 },
    order_number: { path: null, probability: 0.9 },
    mileage_km: { path: null, probability: 0.9 },
    supplier_name: { path: "supplier.name", probability: 0.97 },
    total_incl_vat: { path: "totals.inclVat", probability: 0.95 },
  },
  fills: { license_plate: "OR18DH", supplier_name: "Vianor", total_incl_vat: 293.82 },
};

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId: workOrderForm } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "text", label: "Werkorder", key: "order_number", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: true },
    ],
  });
  const { formId: invoiceForm } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [
      { type: "text", label: "Leverancier", key: "supplier_name", required: true },
      { type: "number", label: "Totaal", key: "total_incl_vat", required: true },
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
    matches: { ...invoice.matches, mileage_km: { path: "vehicle.license_plate", probability: 0.3 } },
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
  const [license_plate, order_number] = (await read()).fieldValues;
  await user.mutation(api.review.correct, { organisationSlug: on.organisationSlug, fieldValueId: order_number.id, value: "WO-1" });
  await user.mutation(api.review.check, { organisationSlug: on.organisationSlug, fieldValueId: license_plate.id });

  expect(await user.query(api.changeForm.impact, on)).toEqual({ corrections: 1 });
});

test("Change Form drops the old values and corrections and runs Match, Fill and Verify again on the stored Reading", async () => {
  const { t, user, on, read, invoiceForm } = await uploadedAgainstWorkOrder();
  const [, order_number] = (await read()).fieldValues;
  await user.mutation(api.review.correct, { organisationSlug: on.organisationSlug, fieldValueId: order_number.id, value: "WO-1" });
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
    ["supplier_name", "Vianor", null],
    ["total_incl_vat", 293.82, null],
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
      order_number: { path: "supplier.vatNumber", probability: 0.9 },
      mileage_km: { path: "totals.inclVat", probability: 0.9 },
    },
    fills: { ...invoice.fills, order_number: "X", mileage_km: 1 },
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

// A Document in No Form (ADR 0010): it arrived with no Form and Jev found none.
async function inNoForm() {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet", { plan: null });
  const forms: Record<string, Id<"forms">> = {};
  for (const [name, fields] of [
    ["Invoice", [
      { type: "text", label: "Leverancier", key: "supplier_name", required: true },
      { type: "number", label: "Totaal", key: "total_incl_vat", required: true },
    ]],
    ["Work order", [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      { type: "text", label: "Werkorder", key: "order_number", required: true },
      { type: "number", label: "Kilometerstand", key: "mileage_km", required: true },
    ]],
  ] as const) {
    forms[name] = (await ann.user.mutation(api.forms.create, { organisationSlug: ann.slug, name, fields: [...fields] })).formId;
  }
  // The Router finds no Form for it.
  fakePipeline.replay({ ...invoice, route: null });
  fakePdfStore.objects.set("org/post.pdf", await pdfWithPages(1));
  const organisationId = await t.run(async (ctx) => (await ctx.db.query("organisations").first())!._id);
  const documentId = await t.mutation(internal.documents.insert, {
    organisationId,
    key: "org/post.pdf",
    filename: "post.pdf",
    pageCount: 1,
    uploadedBy: "ann",
    uploaderEmail: "ann@example.com",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const on = { organisationSlug: ann.slug, documentId };
  const read = () => ann.user.query(api.documents.get, on);
  const used = async () => (await ann.user.query(api.items.usage, { organisationSlug: ann.slug })).used;
  expect((await read()).state).toBe("no_form");
  return { t, user: ann.user, on, read, used, forms };
}

test("a Document in No Form moves to a Form: Match, Fill and Verify run on the stored Reading, with no new Read and no new charge", async () => {
  const { t, user, on, read, used, forms } = await inNoForm();
  expect(await used()).toBe(1);
  expect(await user.query(api.changeForm.impact, on)).toEqual({ corrections: 0 });
  fakePipeline.calls = [];

  await user.mutation(api.changeForm.changeForm, { ...on, formId: forms.Invoice });
  expect((await read()).state).toBe("extracting");
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["match", "fill", "verify"]);
  const document = await read();
  expect(document).toMatchObject({
    state: "needs_review",
    formName: "Invoice",
    formId: forms.Invoice,
    formVersion: 1,
    doesNotFit: false,
  });
  expect(document.fieldValues.map((f) => [f.key, f.value])).toEqual([
    ["supplier_name", "Vianor"],
    ["total_incl_vat", 293.82],
  ]);
  expect(document.history.map((h) => h.event)).toEqual(["uploaded", "no_form", "form_changed", "extracted"]);
  expect(document.history.find((h) => h.event === "form_changed")!.detail).toBe("No Form → Invoice");
  expect(await used()).toBe(1);
  const { counts } = await user.query(api.documents.list, { organisationSlug: on.organisationSlug, state: "no_form" });
  expect(counts).toMatchObject({ no_form: 0, needs_review: 1, extracting: 0 });
});

test("a Document moved out of No Form to a Form it does not fit is flagged, as on any Form", async () => {
  const { t, user, on, read, used, forms } = await inNoForm();

  await user.mutation(api.changeForm.changeForm, { ...on, formId: forms["Work order"] });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await read()).toMatchObject({ state: "needs_review", formName: "Work order", doesNotFit: true });
  expect(await used()).toBe(1);
});
