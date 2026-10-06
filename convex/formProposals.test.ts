import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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

beforeEach(() => {
  vi.useFakeTimers();
  fakePdfStore.objects.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// A Dutch work order: plate, mileage, and the supplier's IBAN nobody needs.
const sample: Recording = {
  reading: {
    vehicle: { license_plate: "NWA-30-E", mileage: "9.899 km", _pages: [1] },
    supplier: { iban: "NL91ABNA0417164300", _pages: [1] },
  },
  matches: {
    license_plate: { path: "vehicle.license_plate", probability: 0.97 },
    mileage_km: { path: "vehicle.mileage", probability: 0.95 },
  },
  fills: { license_plate: "NWA30E", mileage_km: 9899 },
  proposal: [
    {
      field: {
        type: "text",
        label: "Kenteken",
        key: "license_plate",
        description: "Vehicle registration (Kenteken)",
        required: false,
      },
      ticked: true,
    },
    {
      field: {
        type: "number",
        label: "Kilometerstand",
        key: "mileage_km",
        description: "Odometer reading in km (Kilometerstand, Km. stand)",
        // The model said required; proposals never are.
        required: true,
      },
      ticked: true,
    },
    {
      field: { type: "text", label: "IBAN", key: "supplier_iban", required: false },
      ticked: false,
    },
  ],
};

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function proposed(t: Backend, pages = 1) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  fakePipeline.replay(sample);
  const { key, url } = await ann.user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(pages));
  const { proposalId } = await ann.user.action(api.formProposals.create, {
    organisationSlug,
    key,
    filename: "voorbeeld.pdf",
  });
  const read = () => ann.user.query(api.formProposals.get, { organisationSlug, proposalId });
  return { ...ann, organisationSlug, key, proposalId, read };
}

const ticked = (proposal: Awaited<ReturnType<Awaited<ReturnType<typeof proposed>>["read"]>>) =>
  proposal.fields.filter((f) => f.ticked).map((f) => f.field);

test("a sample PDF is read in the background, then every piece of data is proposed with a ticked flag and none required", async () => {
  const t = newBackend();
  const { user, organisationSlug, proposalId, read } = await proposed(t);
  expect((await read()).state).toBe("reading");
  // Listed, so the Admin can leave and come back.
  expect(await user.query(api.formProposals.list, { organisationSlug })).toEqual([
    expect.objectContaining({ id: proposalId, filename: "voorbeeld.pdf", state: "reading" }),
  ]);

  await settle(t);

  const proposal = await read();
  expect(proposal).toMatchObject({ state: "ready", filename: "voorbeeld.pdf", error: null });
  expect(proposal.fields.map((f) => [f.field.key, f.ticked, f.field.required])).toEqual([
    ["license_plate", true, false],
    ["mileage_km", true, false],
    ["supplier_iban", false, false],
  ]);
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "propose"]);
  expect(fakePipeline.calls[1]).toMatchObject({ reading: sample.reading });
});

test("saving the ticked Fields creates the Form's first Version, and the sample becomes its first Document without a second Read", async () => {
  const t = newBackend();
  const { user, organisationSlug, proposalId, read } = await proposed(t);
  await settle(t);
  fakePipeline.calls = [];

  const { formId, documentId } = await user.mutation(api.formProposals.save, {
    organisationSlug,
    proposalId,
    name: "Work order",
    fields: ticked(await read()),
    processSample: true,
  });
  await settle(t);

  const form = await user.query(api.forms.get, { organisationSlug, formId });
  expect(form).toMatchObject({ name: "Work order", version: 1 });
  expect(form.fields.map((f) => f.key)).toEqual(["license_plate", "mileage_km"]);
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["match", "fill", "verify"]);
  const document = await user.query(api.documents.get, {
    organisationSlug,
    documentId: documentId as Id<"documents">,
  });
  expect(document).toMatchObject({ filename: "voorbeeld.pdf", state: "needs_review", formVersion: 1 });
  expect(document.fieldValues.map((f) => f.value)).toEqual(["NWA30E", 9899]);
  await expect(read()).rejects.toThrow("Form Proposal not found");
});

test("with \"Also process this sample\" off, the sample's PDF and Reading are deleted at once", async () => {
  const t = newBackend();
  const { user, organisationSlug, key, proposalId, read } = await proposed(t);
  await settle(t);

  const { documentId } = await user.mutation(api.formProposals.save, {
    organisationSlug,
    proposalId,
    name: "Work order",
    fields: ticked(await read()),
    processSample: false,
  });

  expect(documentId).toBeNull();
  expect(fakePdfStore.objects.has(key)).toBe(false);
  await expect(read()).rejects.toThrow("Form Proposal not found");
  const left = await t.run(async (ctx) => ({
    documents: await ctx.db.query("documents").collect(),
    proposals: await ctx.db.query("formProposals").collect(),
  }));
  expect(left).toEqual({ documents: [], proposals: [] });
});

test("a failed proposal shows its error and can be retried without reading the sample again", async () => {
  const t = newBackend();
  fakePipeline.failTimes("propose", 4);
  const { user, organisationSlug, proposalId, read } = await proposed(t);
  await settle(t);
  expect(await read()).toMatchObject({ state: "failed", error: expect.stringContaining("propose is down") });
  fakePipeline.calls = [];

  await user.mutation(api.formProposals.retry, { organisationSlug, proposalId });
  await settle(t);

  expect((await read()).state).toBe("ready");
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["propose"]);
});

test("an Admin can discard a proposal; its PDF goes too", async () => {
  const t = newBackend();
  const { user, organisationSlug, key, proposalId, read } = await proposed(t);
  await settle(t);

  await user.mutation(api.formProposals.discard, { organisationSlug, proposalId });

  expect(fakePdfStore.objects.has(key)).toBe(false);
  await expect(read()).rejects.toThrow("Form Proposal not found");
});

test("a sample over 20 pages is refused", async () => {
  const t = newBackend();

  await expect(proposed(t, 21)).rejects.toThrow("21 pages");
});

test("only an Admin can create or see a Form Proposal", async () => {
  const t = newBackend();
  const { organisationSlug, proposalId, key } = await proposed(t);
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(
    bob.action(api.formProposals.create, { organisationSlug, key, filename: "x.pdf" }),
  ).rejects.toThrow("Forbidden");
  await expect(bob.query(api.formProposals.get, { organisationSlug, proposalId })).rejects.toThrow(
    "Forbidden",
  );
});

test("nobody sees another Organisation's Form Proposal", async () => {
  const t = newBackend();
  const { proposalId } = await proposed(t);
  const eve = await signUp(t, "eve", "Evil Corp");

  await expect(
    eve.user.query(api.formProposals.get, { organisationSlug: eve.slug, proposalId }),
  ).rejects.toThrow("Form Proposal not found");
});
