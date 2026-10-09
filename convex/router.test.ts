// The Router (ADR 0010, step 5): a Submission that came without a Form is read,
// Jev picks a Form among the Organisation's, and the fit check gates the pick.
// Reader, Router (Jev), Matcher, Filler and Verifier are the fakes of test.setup.ts.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  fakePdfStore,
  fakePipeline,
  newBackend,
  pdfWithPages,
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
});

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);
const steps = () => fakePipeline.calls.map((c) => c.step);

const invoice: Recording = {
  reading: { supplier: { name: "Hoekstra Installatie", _pages: [1] }, totals: { inclVat: "151,25", _pages: [1] } },
  matches: {
    supplier_name: { path: "supplier.name", probability: 0.97 },
    total_incl_vat: { path: "totals.inclVat", probability: 0.95 },
  },
  fills: { supplier_name: "Hoekstra Installatie", total_incl_vat: 151.25 },
  route: "Invoice",
};

const complaint: Recording = {
  reading: { complaint: { subject: "Klacht over levering 4410", _pages: [1] }, order: { number: "WB-2217", _pages: [1] } },
  matches: {
    subject: { path: "complaint.subject", probability: 0.99 },
    order_number: { path: "order.number", probability: 0.9 },
  },
  fills: { subject: "Klacht over levering 4410", order_number: "WB-2217" },
  route: "Complaint",
};

// A holiday postcard: no Form is made for it.
const postcard: Recording = {
  reading: { postcard: { text: "Groeten uit Zeeland", _pages: [1] } },
  matches: {},
  fills: {},
};

const invoiceFields = [
  { type: "text", label: "Leverancier", key: "supplier_name", required: true },
  { type: "number", label: "Totaal", key: "total_incl_vat", required: true },
] as const;

const complaintFields = [
  { type: "text", label: "Onderwerp", key: "subject", required: true },
  { type: "text", label: "Werkbonnummer", key: "order_number", required: true },
] as const;

/** An Organisation on Free Items, so every charge shows. */
async function acme(t: Backend, forms: Array<"invoice" | "complaint">) {
  const ann = await signUp(t, "ann", "Bakkerij De Wit", { plan: null });
  const ids: Record<string, Id<"forms">> = {};
  for (const form of forms) {
    const { formId } = await ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: form === "invoice" ? "Invoice" : "Complaint",
      description: form === "invoice" ? "Supplier invoices" : "Customer complaints",
      fields: [...(form === "invoice" ? invoiceFields : complaintFields)],
    });
    ids[form] = formId;
  }
  const organisationId = await t.run(async (ctx) => (await ctx.db.query("organisations").first())!._id);
  return { ...ann, ids, organisationId };
}

let uploads = 0;

/** An accepted Submission with no Form (charged on accept), then the pipeline runs. */
async function arrivesWithoutForm(t: Backend, organisationId: Id<"organisations">, recording: Recording) {
  fakePipeline.replay(recording);
  const key = `org/input-${++uploads}.pdf`;
  fakePdfStore.objects.set(key, await pdfWithPages(1));
  const submissionId = await t.mutation(internal.submissions.insert, {
    organisationId,
    key,
    filename: "input.pdf",
    pageCount: 1,
    uploadedBy: "ann",
    uploaderEmail: "ann@example.com",
  });
  await settle(t);
  return submissionId;
}

const used = async (org: Awaited<ReturnType<typeof acme>>) =>
  (await org.user.query(api.items.usage, { organisationSlug: org.slug })).used;

const read = (org: Awaited<ReturnType<typeof acme>>, submissionId: Id<"submissions">) =>
  org.user.query(api.submissions.get, { organisationSlug: org.slug, submissionId });

test("with two Forms, Jev routes each Submission to its own Form and the Items are charged once each", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);

  const first = await arrivesWithoutForm(t, org.organisationId, invoice);
  const second = await arrivesWithoutForm(t, org.organisationId, complaint);

  expect(await read(org, first)).toMatchObject({
    state: "needs_review",
    formName: "Invoice",
    formId: org.ids.invoice,
    formVersion: 1,
    doesNotFit: false,
  });
  expect(await read(org, second)).toMatchObject({
    state: "needs_review",
    formName: "Complaint",
    formId: org.ids.complaint,
  });
  expect(fakePipeline.calls.filter((c) => c.step === "route")).toEqual([
    { step: "route", forms: ["Invoice", "Complaint"] },
    { step: "route", forms: ["Invoice", "Complaint"] },
  ]);
  // Match runs on the picked Form's Fields only.
  const matches = fakePipeline.calls.filter((c) => c.step === "match");
  expect(matches.map((m) => m.step === "match" && m.fields)).toEqual([
    ["supplier_name", "total_incl_vat"],
    ["subject", "order_number"],
  ]);
  const history = (await read(org, first)).history;
  expect(history.map((h) => h.event)).toEqual(["uploaded", "routed", "extracted"]);
  expect(history[1].detail).toBe("Invoice (90%)");
  expect(history[1].info).toEqual({ code: "routed", form: "Invoice", percent: 90 });
  expect(await used(org)).toBe(2);
});

test("with two Forms, input that no Form is made for goes to No Form, with its Reading and its Item", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);

  const submissionId = await arrivesWithoutForm(t, org.organisationId, postcard);

  const submission = await read(org, submissionId);
  expect(submission).toMatchObject({ state: "no_form", formId: null, formVersion: null, formName: "" });
  expect(submission.history.map((h) => h.event)).toEqual(["uploaded", "no_form"]);
  expect(submission.history[1].detail).toBe("No Form fits");
  expect(submission.history[1].info).toEqual({ code: "no_fit" });
  // Jev found none, so nothing was matched, filled or verified.
  expect(steps()).toEqual(["read", "route"]);
  const stored = await t.run(async (ctx) => await ctx.db.query("readings").collect());
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0].json)).toEqual(postcard.reading);
  expect(await used(org)).toBe(1);
});

test("a Form Jev picks that fails the fit check is not kept: the Submission goes to No Form", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);

  // Jev picks the Invoice Form for a postcard, but no required Field matches.
  const submissionId = await arrivesWithoutForm(t, org.organisationId, { ...postcard, route: "Invoice" });

  const submission = await read(org, submissionId);
  expect(submission).toMatchObject({ state: "no_form", formId: null, doesNotFit: false });
  expect(submission.history.map((h) => h.event)).toEqual(["uploaded", "no_form"]);
  expect(submission.history[1].detail).toBe("Does not fit Invoice");
  expect(submission.history[1].info).toEqual({ code: "no_fit", form: "Invoice" });
  // Nothing was matched, so there was nothing to fill or verify.
  expect(steps()).toEqual(["read", "route", "match"]);
  const values = await t.run(async (ctx) => await ctx.db.query("fieldValues").collect());
  expect(values).toEqual([]);
  expect(await used(org)).toBe(1);
});

test("with one Form, input that does not fit goes to No Form, and input that fits is filled", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);

  const fits = await arrivesWithoutForm(t, org.organisationId, invoice);
  const doesNotFit = await arrivesWithoutForm(t, org.organisationId, { ...postcard, route: "Invoice" });

  expect(await read(org, fits)).toMatchObject({ state: "needs_review", formName: "Invoice" });
  expect(await read(org, doesNotFit)).toMatchObject({ state: "no_form", formId: null });
  // The router ran with the single Form both times.
  expect(fakePipeline.calls.filter((c) => c.step === "route")).toHaveLength(2);
  expect(await used(org)).toBe(2);
});

test("an Organisation with no Forms puts the Submission in No Form, charged, without asking Jev", async () => {
  const t = newBackend();
  const org = await acme(t, []);

  const submissionId = await arrivesWithoutForm(t, org.organisationId, invoice);

  expect(await read(org, submissionId)).toMatchObject({ state: "no_form", formId: null });
  expect(steps()).toEqual(["read"]);
  expect(await used(org)).toBe(1);
});

test("a Submission that arrives with a Form skips the Router", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);
  fakePipeline.replay({ ...invoice, route: "Complaint" });
  fakePdfStore.objects.set("org/with-form.pdf", await pdfWithPages(1));

  const submissionId = await t.mutation(internal.submissions.insert, {
    organisationId: org.organisationId,
    formId: org.ids.invoice,
    key: "org/with-form.pdf",
    filename: "factuur.pdf",
    pageCount: 1,
    uploadedBy: "ann",
    uploaderEmail: "ann@example.com",
  });
  await settle(t);

  expect(await read(org, submissionId)).toMatchObject({ state: "needs_review", formName: "Invoice" });
  expect(steps()).not.toContain("route");
});

test("the No Form list shows the Submissions with no Form, and its tab counts them", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);
  await arrivesWithoutForm(t, org.organisationId, invoice);
  const lost = await arrivesWithoutForm(t, org.organisationId, postcard);

  const noForm = await org.user.query(api.submissions.list, { organisationSlug: org.slug, state: "no_form" });

  expect(noForm.counts).toMatchObject({ needs_review: 1, no_form: 1 });
  expect(noForm.submissions).toEqual([
    expect.objectContaining({ id: lost, state: "no_form", formName: "", formVersion: null }),
  ]);
  const other = await org.user.query(api.submissions.list, { organisationSlug: org.slug, state: "needs_review" });
  expect(other.submissions.map((d) => d.formName)).toEqual(["Invoice"]);
});

test("a No Form Submission can be rejected and reopened back into No Form", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);
  const submissionId = await arrivesWithoutForm(t, org.organisationId, postcard);
  const on = { organisationSlug: org.slug, submissionId };

  await org.user.mutation(api.rejection.reject, { ...on, reason: "Spam" });
  expect((await read(org, submissionId)).state).toBe("rejected");
  await org.user.mutation(api.rejection.reopen, on);

  expect(await read(org, submissionId)).toMatchObject({ state: "no_form", formId: null });
  const { counts } = await org.user.query(api.submissions.list, { organisationSlug: org.slug, state: "no_form" });
  expect(counts).toMatchObject({ no_form: 1, rejected: 0 });
});

test("a No Form Submission is never approved, and the public API reads it as no_form without a Form", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);
  const submissionId = await arrivesWithoutForm(t, org.organisationId, postcard);

  await expect(
    org.user.mutation(api.review.approve, { organisationSlug: org.slug, submissionId }),
  ).rejects.toThrow("can't be reviewed");

  const answer = await t.query(internal.publicApi.submissionRead.read, {
    organisationId: org.organisationId,
    submissionId,
  });
  expect(answer).toMatchObject({ form_id: null, state: "no_form", payload: null });
});

test("a Submission in No Form is deleted after 90 days like any never-approved Submission", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);
  const submissionId = await arrivesWithoutForm(t, org.organisationId, postcard);

  vi.setSystemTime(Date.now() + 91 * 24 * 3600 * 1000);
  await t.mutation(internal.retention.run, {});

  expect((await read(org, submissionId)).state).toBe("deleted");
});

test("a failed Router is retried from the stored Reading: no new Read, no new charge", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);
  fakePipeline.failTimes("route", 4);
  const submissionId = await arrivesWithoutForm(t, org.organisationId, invoice);
  expect((await read(org, submissionId)).state).toBe("extraction_failed");
  expect(await used(org)).toBe(1);
  fakePipeline.calls = [];

  await org.user.mutation(api.extraction.retry, { organisationSlug: org.slug, submissionId });
  await settle(t);

  expect(steps()).toEqual(["route", "match", "fill", "verify"]);
  expect(await read(org, submissionId)).toMatchObject({ state: "needs_review", formName: "Invoice" });
  expect(await used(org)).toBe(1);
});

test("a Submission the Router routed never Auto-Sends, and one that came with the same Form does", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice"]);
  await org.user.mutation(api.forms.updateSettings, {
    organisationSlug: org.slug,
    formId: org.ids.invoice,
    reviewThreshold: 0.8,
    autoSend: true,
  });

  const routed = await arrivesWithoutForm(t, org.organisationId, invoice);
  fakePipeline.replay(invoice);
  fakePdfStore.objects.set("org/with-form-auto.pdf", await pdfWithPages(1));
  const given = await t.mutation(internal.submissions.insert, {
    organisationId: org.organisationId,
    formId: org.ids.invoice,
    key: "org/with-form-auto.pdf",
    filename: "factuur.pdf",
    pageCount: 1,
    uploadedBy: "ann",
    uploaderEmail: "ann@example.com",
  });
  await settle(t);

  // The same Form, the same clean Reading: only the route to the Form differs.
  expect(await read(org, routed)).toMatchObject({ state: "needs_review", formName: "Invoice", approval: null });
  expect(await read(org, given)).toMatchObject({ state: "approved", approval: { mode: "auto" } });
});

test("a routed Submission that matches no Field of a Form without required Fields goes to No Form", async () => {
  const t = newBackend();
  const org = await acme(t, []);
  const { formId } = await org.user.mutation(api.forms.create, {
    organisationSlug: org.slug,
    name: "Notes",
    fields: [{ type: "text", label: "Opmerking", key: "remark", required: false }],
  });

  const nothing = await arrivesWithoutForm(t, org.organisationId, { ...postcard, route: "Notes" });
  const something = await arrivesWithoutForm(t, org.organisationId, {
    ...postcard,
    matches: { remark: { path: "postcard.text", probability: 0.9 } },
    fills: { remark: "Groeten uit Zeeland" },
    route: "Notes",
  });

  expect(await read(org, nothing)).toMatchObject({ state: "no_form", formId: null });
  expect((await read(org, nothing)).history[1].detail).toBe("Does not fit Notes");
  expect(await read(org, something)).toMatchObject({ state: "needs_review", formId });
});

test("a Submission that arrives with a Form keeps the plain fit check: no matched Field is not a No Form", async () => {
  const t = newBackend();
  const org = await acme(t, []);
  const { formId } = await org.user.mutation(api.forms.create, {
    organisationSlug: org.slug,
    name: "Notes",
    fields: [{ type: "text", label: "Opmerking", key: "remark", required: false }],
  });
  fakePipeline.replay(postcard);
  fakePdfStore.objects.set("org/notes.pdf", await pdfWithPages(1));

  const submissionId = await t.mutation(internal.submissions.insert, {
    organisationId: org.organisationId,
    formId,
    key: "org/notes.pdf",
    filename: "notes.pdf",
    pageCount: 1,
    uploadedBy: "ann",
    uploaderEmail: "ann@example.com",
  });
  await settle(t);

  expect(await read(org, submissionId)).toMatchObject({ state: "needs_review", formId, doesNotFit: false });
});

test("a Reading with no values goes to No Form without asking Jev", async () => {
  const t = newBackend();
  const org = await acme(t, ["invoice", "complaint"]);

  const submissionId = await arrivesWithoutForm(t, org.organisationId, {
    reading: { page: { text: "", _pages: [1] } },
    matches: {},
    fills: {},
    route: "Invoice",
  });

  const submission = await read(org, submissionId);
  expect(submission).toMatchObject({ state: "no_form", formId: null });
  expect(submission.history[1].detail).toBe("Nothing could be read");
  expect(submission.history[1].info).toEqual({ code: "nothing_read" });
  expect(steps()).toEqual(["read"]);
  expect(await used(org)).toBe(1);
});
