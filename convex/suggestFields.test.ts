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
  uploadAndExtract,
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

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

// A second supplier's layout: the plate and the tyre list are already on the
// Form; the mileage and the purchase order number are new.
const secondSupplier: Recording = {
  reading: {
    _pages: [1],
    vehicle: { licensePlate: "OR18DH", mileage: "229546", _pages: [1] },
    order: { purchaseOrder: "HKPB018899", _pages: [1] },
    tyreChanges: [{ position: "6", serial: "6135366435", _pages: [1] }],
  },
  matches: {
    licensePlate: { path: "vehicle.licensePlate", probability: 0.96 },
  },
  lists: {
    tyreChanges: {
      path: "tyreChanges",
      probability: 0.93,
      keys: { position: { path: "position", probability: 0.97 } },
    },
  },
  fills: { licensePlate: "OR18DH" },
  proposal: [
    {
      field: { type: "number", label: "Km. stand", key: "mileageKm", required: false },
      ticked: true,
    },
    {
      field: { type: "text", label: "Bestelbon", key: "purchaseOrderNumber", required: false },
      ticked: true,
    },
    // Another plate-like Field: its key is taken on the Form, so it gets a new one.
    { field: { type: "text", label: "Nummerplaat", key: "licensePlate", required: false }, ticked: false },
  ],
};

async function suggested(t: Backend, recording: Recording = secondSupplier) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [
      { type: "text", label: "Kenteken", key: "licensePlate", required: true },
      {
        type: "list",
        label: "Banden",
        key: "tyreChanges",
        required: false,
        fields: [{ type: "text", label: "Positie", key: "position", required: false }],
      },
    ],
  });
  fakePipeline.replay(recording);
  const { key, url } = await ann.user.mutation(api.documents.generateUploadUrl, { organisationSlug });
  putToUploadUrl(url, await pdfWithPages(1));
  const { proposalId } = await ann.user.action(api.formProposals.create, {
    organisationSlug,
    key,
    filename: "leverancier-b.pdf",
    formId,
  });
  await settle(t);
  const read = () => ann.user.query(api.formProposals.get, { organisationSlug, proposalId });
  return { ...ann, organisationSlug, formId, key, proposalId, read };
}

test("the new sample is matched against the current Form, and only the parts that matched none go to the Proposer", async () => {
  const t = newBackend();
  await suggested(t);

  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match", "propose"]);
  expect(fakePipeline.calls[1]).toMatchObject({ fields: ["licensePlate"], lists: ["tyreChanges"] });
  expect(fakePipeline.calls[2]).toEqual({
    step: "propose",
    reading: {
      _pages: [1],
      vehicle: { mileage: "229546", _pages: [1] },
      order: { purchaseOrder: "HKPB018899", _pages: [1] },
    },
  });
});

test("a Field the Form already has is never proposed again: a clashing key gets a new one", async () => {
  const t = newBackend();
  const { read } = await suggested(t);

  const proposal = await read();
  expect(proposal.state).toBe("ready");
  expect(proposal.formId).not.toBeNull();
  expect(proposal.fields.map((f) => f.field.key)).toEqual([
    "mileageKm",
    "purchaseOrderNumber",
    "licensePlate2",
  ]);
});

test("when the Form already places everything, nothing is proposed", async () => {
  const t = newBackend();
  const { read } = await suggested(t, {
    ...secondSupplier,
    reading: {
      vehicle: { licensePlate: "OR18DH", _pages: [1] },
      tyreChanges: [{ position: "6", _pages: [1] }],
    },
  });

  expect((await read())).toMatchObject({ state: "ready", fields: [] });
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["read", "match"]);
});

test("saving the kept suggestions creates a new Form Version and leaves existing Documents on theirs", async () => {
  const t = newBackend();
  const { user, organisationSlug, formId, key, proposalId, read } = await suggested(t);
  fakePipeline.replay(secondSupplier);
  const documentId = (await uploadAndExtract(t, user, organisationSlug, formId)) as Id<"documents">;
  const form = await user.query(api.forms.get, { organisationSlug, formId });
  const kept = (await read()).fields.filter((f) => f.ticked).map((f) => f.field);

  const { version } = await user.mutation(api.formProposals.saveToForm, {
    organisationSlug,
    proposalId,
    name: form.name,
    fields: [...form.fields, ...kept],
  });

  expect(version).toBe(2);
  const saved = await user.query(api.forms.get, { organisationSlug, formId });
  expect(saved.fields.map((f) => f.key)).toEqual([
    "licensePlate",
    "tyreChanges",
    "mileageKm",
    "purchaseOrderNumber",
  ]);
  expect(
    (await user.query(api.documents.get, { organisationSlug, documentId })).formVersion,
  ).toBe(1);
  expect(fakePdfStore.objects.has(key)).toBe(false);
  await expect(read()).rejects.toThrow("Form Proposal not found");
});

test("only an Admin can suggest Fields for a Form", async () => {
  const t = newBackend();
  const { organisationSlug, formId } = await suggested(t);
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(
    bob.action(api.formProposals.create, { organisationSlug, key: "x", filename: "x.pdf", formId }),
  ).rejects.toThrow("Forbidden");
});
