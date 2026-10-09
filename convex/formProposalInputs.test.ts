// Step 10 of the "any input" plan: a new Form starts from a sample that is a
// PDF, a photo or an email (.eml or pasted text), or from the Admin's words
// alone ("Describe in words": no sample, no Reading, no Items charged).
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  DESCRIPTION_WINDOW_MS,
  DESCRIPTION_EMPTY,
  DESCRIPTION_TOO_LONG,
  DESCRIPTIONS_PER_DAY_REACHED,
  MAX_DESCRIPTION_CHARS,
  MAX_DESCRIPTIONS_PER_DAY,
} from "./lib/formDescription";
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
  fakePdfStore.types.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

// A complaint: what a customer writes, and the customer number nobody else needs to see ticked.
const complaint: Recording = {
  reading: {
    complaint: { subject: "Late levering", customer_number: "K-4471", _pages: [1] },
    sender: { phone: "06 1234 5678", _pages: [1] },
  },
  matches: {
    subject: { path: "complaint.subject", probability: 0.97 },
    customer_number: { path: "complaint.customer_number", probability: 0.95 },
  },
  fills: { subject: "Late levering", customer_number: "K-4471" },
  proposal: [
    { field: { type: "text", label: "Onderwerp", key: "subject", description: "What the complaint is about (Onderwerp)", required: false }, ticked: true },
    // The model said required; proposals never are.
    { field: { type: "text", label: "Klantnummer", key: "customer_number", required: true }, ticked: true },
    { field: { type: "text", label: "Telefoon", key: "phone", required: false }, ticked: false },
  ],
};

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const heic = () =>
  new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1")]);

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function eml(parts: { pdfPages?: number; body?: string }) {
  const lines = [
    "From: Klant <klant@voorbeeld.example>",
    "To: klachten@bedrijf.example",
    "Subject: Klacht over late levering",
    "Date: Tue, 06 Oct 2026 09:00:00 +0200",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    parts.body ?? "Mijn bestelling is te laat.",
    "--b1",
  ];
  if (parts.pdfPages) {
    lines.push(
      'Content-Type: application/pdf; name="bon.pdf"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="bon.pdf"',
      "",
      base64(await pdfWithPages(parts.pdfPages)),
      "--b1",
    );
  }
  lines[lines.length - 1] = "--b1--";
  return new TextEncoder().encode(lines.join("\r\n") + "\r\n");
}

/** An Organisation on Free Items (20), signed up as its Admin. */
async function klachten(t: Backend) {
  const ann = await signUp(t, "ann", "Klachtenbalie", { plan: null });
  const used = async () => (await ann.user.query(api.items.usage, { organisationSlug: ann.slug })).used;
  const read = (proposalId: Parameters<typeof ann.user.query<typeof api.formProposals.get>>[1]["proposalId"]) =>
    ann.user.query(api.formProposals.get, { organisationSlug: ann.slug, proposalId });
  /** What the sample dialog does for a file: get an upload URL, PUT the bytes, create the proposal. */
  const sample = async (filename: string, bytes: Uint8Array) => {
    const { key, url } = await ann.user.mutation(api.submissions.generateUploadUrl, { organisationSlug: ann.slug });
    putToUploadUrl(url, bytes);
    const { proposalId } = await ann.user.action(api.formProposals.create, {
      organisationSlug: ann.slug,
      key,
      filename,
    });
    return { key, proposalId };
  };
  const rows = {
    proposals: () => t.run(async (ctx) => await ctx.db.query("formProposals").collect()),
    submissions: () => t.run(async (ctx) => await ctx.db.query("submissions").collect()),
    forms: () => t.run(async (ctx) => await ctx.db.query("forms").collect()),
  };
  return { ...ann, used, read, sample, rows };
}

const keptFields = (proposal: { fields: Array<{ field: unknown; ticked: boolean }> }) =>
  proposal.fields.filter((f) => f.ticked).map((f) => f.field) as never[];

// --- photo samples ---

test.each([
  ["klacht.jpg", jpeg(), "image/jpeg"],
  ["klacht.png", png(), "image/png"],
  ["IMG_0042.HEIC", heic(), "image/heic"],
])("a photo (%s) is a sample: read as an image, 1 Item, and the same Fields come back", async (name, bytes, mimeType) => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);

  const { proposalId } = await org.sample(name, bytes);

  expect(await org.rows.proposals()).toMatchObject([{ kind: "image", mimeType, filename: name, pageCount: 1 }]);
  expect(await org.used()).toBe(1);
  await settle(t);

  expect(fakePipeline.reads).toEqual([{ kind: "image", bytes, mimeType }]);
  expect(fakePipeline.proposed).toEqual([{ kind: "image", bytes, mimeType }]);
  const proposal = await org.read(proposalId);
  expect(proposal).toMatchObject({ state: "ready", kind: "image", hasSample: true, description: null });
  expect(proposal.fields.map((f) => [f.field.key, f.ticked, f.field.required])).toEqual([
    ["subject", true, false],
    ["customer_number", true, false],
    ["phone", false, false],
  ]);
});

test("the bytes decide the kind: PNG bytes named .pdf are a photo sample", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);

  await org.sample("scan.pdf", png());

  expect(await org.rows.proposals()).toMatchObject([{ kind: "image", mimeType: "image/png" }]);
});

test("a photo sample becomes the Form's first Submission from the stored Reading, without a second Read or a second charge", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const { proposalId } = await org.sample("klacht.jpg", jpeg());
  await settle(t);
  fakePipeline.calls = [];

  const { formId, submissionId } = await org.user.mutation(api.formProposals.save, {
    organisationSlug: org.slug,
    proposalId,
    name: "Klacht",
    fields: keptFields(await org.read(proposalId)),
    processSample: true,
  });
  await settle(t);

  expect(formId).toBeTruthy();
  const [submission] = await org.rows.submissions();
  expect(submission).toMatchObject({ _id: submissionId, kind: "image", mimeType: "image/jpeg", formId, state: "needs_review" });
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["match", "fill", "verify"]);
  expect(await org.used()).toBe(1);
});

test("a photo over 10 MB or a file of another type is refused as a sample: nothing is charged or left in storage", async () => {
  const t = newBackend();
  const org = await klachten(t);
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  big.set(jpeg());

  await expect(org.sample("groot.jpg", big)).rejects.toThrow("The image is larger than 10 MB.");
  await expect(org.sample("notities.txt", new TextEncoder().encode("hallo"))).rejects.toThrow(
    "this file type isn't supported",
  );

  expect(await org.rows.proposals()).toEqual([]);
  expect(fakePdfStore.objects.size).toBe(0);
  expect(await org.used()).toBe(0);
});

// --- email samples ---

test("pasted email text is a sample: written by the server, 1 Item, read as an email", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);

  const { proposalId } = await org.user.action(api.formProposals.createFromEmail, {
    organisationSlug: org.slug,
    subject: "Klacht over late levering",
    body: "Mijn bestelling K-4471 is te laat.",
  });

  const [row] = await org.rows.proposals();
  expect(row).toMatchObject({
    kind: "email",
    mimeType: "application/json",
    filename: "Klacht over late levering",
    pageCount: 1,
    state: "reading",
  });
  expect(row.key!.startsWith(`${row.organisationId}/`)).toBe(true);
  expect(JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(row.key!)))).toEqual({
    subject: "Klacht over late levering",
    from: "",
    date: "",
    body: "Mijn bestelling K-4471 is te laat.",
    attachments: [],
  });
  expect(await org.used()).toBe(1);
  await settle(t);
  expect(fakePipeline.reads).toMatchObject([{ kind: "email", subject: "Klacht over late levering", attachments: [] }]);
  expect(fakePipeline.proposed).toMatchObject([{ kind: "email" }]);
  expect(await org.read(proposalId)).toMatchObject({ state: "ready", kind: "email", hasSample: true });
});

test("an .eml file is a sample: its text and PDF attachment cost 1 + the PDF's pages, the raw upload goes, and discarding removes every file", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);

  const { key: rawKey, proposalId } = await org.sample("klacht.eml", await eml({ pdfPages: 2 }));

  const [row] = await org.rows.proposals();
  expect(row).toMatchObject({ kind: "email", filename: "Klacht over late levering" });
  expect(row.key).not.toBe(rawKey);
  expect(row.attachmentKeys).toEqual([`${row.key}/1`]);
  expect(fakePdfStore.objects.has(rawKey)).toBe(false);
  expect(fakePdfStore.objects.size).toBe(2);
  expect(await org.used()).toBe(3);
  // The raw upload is no orphan any more.
  expect(await t.run(async (ctx) => await ctx.db.query("uploads").collect())).toEqual([]);
  await settle(t);
  expect(fakePipeline.reads).toMatchObject([{ kind: "email", attachments: [{ filename: "bon.pdf" }] }]);

  await org.user.mutation(api.formProposals.discard, { organisationSlug: org.slug, proposalId });
  expect(fakePdfStore.objects.size).toBe(0);
});

test("an email sample becomes the Form's first Submission, attachments included, at no second charge", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const { proposalId } = await org.sample("klacht.eml", await eml({ pdfPages: 1 }));
  await settle(t);

  await org.user.mutation(api.formProposals.save, {
    organisationSlug: org.slug,
    proposalId,
    name: "Klacht",
    fields: keptFields(await org.read(proposalId)),
    processSample: true,
  });
  await settle(t);

  const [submission] = await org.rows.submissions();
  expect(submission).toMatchObject({ kind: "email", state: "needs_review" });
  expect(submission.attachmentKeys).toEqual([`${submission.key}/1`]);
  expect(fakePdfStore.objects.size).toBe(2);
  expect(await org.used()).toBe(2);
});

test("an empty email, or one that does not fit the Items left, is refused whole: nothing is stored or charged", async () => {
  const t = newBackend();
  const org = await klachten(t);

  await expect(
    org.user.action(api.formProposals.createFromEmail, { organisationSlug: org.slug, body: "  \n " }),
  ).rejects.toThrow("This email has no text and no attachments.");
  await expect(org.sample("leeg.eml", await eml({ body: "" }))).rejects.toThrow("no text and no attachments");
  expect(fakePdfStore.objects.size).toBe(0);

  // 20 Items: 18 are used, 1 for the text and 3 for the PDF need 4.
  await org.sample("groot.pdf", await pdfWithPages(18));
  const before = fakePdfStore.objects.size;
  await expect(org.sample("klacht.eml", await eml({ pdfPages: 3 }))).rejects.toMatchObject({
    data: { code: "out_of_items", remaining: 2, needed: 4 },
  });
  expect(fakePdfStore.objects.size).toBe(before);
  expect(await org.rows.proposals()).toHaveLength(1);
  expect(await org.used()).toBe(18);
});

// --- describe in words ---

const description = "Een klacht van een klant. Ik wil het onderwerp, het klantnummer en de datum van de klacht.";

test("a description proposes Fields without a sample: no Read, no Items, the editor's own shape", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);

  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description: `  ${description}\n`,
  });

  // Straight to proposing: there is nothing to read.
  const [row] = await org.rows.proposals();
  expect(row).toMatchObject({ description, state: "proposing", pageCount: 0, filename: description.slice(0, 59) + "…" });
  expect(row.key).toBeUndefined();
  expect(await org.read(proposalId)).toMatchObject({ state: "proposing", hasSample: false, description });
  expect(await org.user.query(api.formProposals.list, { organisationSlug: org.slug })).toEqual([
    expect.objectContaining({ id: proposalId, state: "proposing" }),
  ]);

  await settle(t);

  // The Proposer was asked with the description; no Reader, no Router, no sample.
  expect(fakePipeline.calls).toEqual([{ step: "describe", description }]);
  expect(fakePipeline.reads).toEqual([]);
  expect(fakePipeline.proposed).toEqual([]);
  const proposal = await org.read(proposalId);
  expect(proposal).toMatchObject({ state: "ready", failure: null });
  // The same shape as a sample's proposal, none required: the proposal editor works unchanged.
  expect(proposal.fields.map((f) => [f.field.key, f.ticked, f.field.required])).toEqual([
    ["subject", true, false],
    ["customer_number", true, false],
    ["phone", false, false],
  ]);
  // A description is not input: no Items.
  expect(await org.used()).toBe(0);
  expect(fakePdfStore.objects.size).toBe(0);
});

test("a described Form is saved with the kept Fields and the Admin's words; there is no sample to process", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description,
  });
  await settle(t);
  const fields = keptFields(await org.read(proposalId));

  // "Also process this sample" has nothing to process.
  await expect(
    org.user.mutation(api.formProposals.save, {
      organisationSlug: org.slug, proposalId, name: "Klacht", description, fields, processSample: true,
    }),
  ).rejects.toThrow("This proposal has no sample to process");
  expect(await org.rows.forms()).toEqual([]);

  const { formId, submissionId } = await org.user.mutation(api.formProposals.save, {
    organisationSlug: org.slug, proposalId, name: "Klacht", description, fields, processSample: false,
  });

  expect(submissionId).toBeNull();
  const form = await org.user.query(api.forms.get, { organisationSlug: org.slug, formId });
  expect(form).toMatchObject({ name: "Klacht", description, version: 1 });
  expect(form.fields.map((f) => f.key)).toEqual(["subject", "customer_number"]);
  expect(await org.rows.proposals()).toEqual([]);
  expect(await org.rows.submissions()).toEqual([]);
  expect(await org.used()).toBe(0);
});

test("an empty or too long description is refused, and no proposal is made", async () => {
  const t = newBackend();
  const org = await klachten(t);
  const create = (text: string) =>
    org.user.mutation(api.formProposals.createFromDescription, { organisationSlug: org.slug, description: text });

  await expect(create("")).rejects.toThrow(DESCRIPTION_EMPTY);
  await expect(create("  \n\t ")).rejects.toThrow(DESCRIPTION_EMPTY);
  await expect(create("x".repeat(MAX_DESCRIPTION_CHARS + 1))).rejects.toThrow(DESCRIPTION_TOO_LONG);
  // The longest one that is allowed.
  await create("x".repeat(MAX_DESCRIPTION_CHARS));

  expect(await org.rows.proposals()).toHaveLength(1);
  expect(await org.used()).toBe(0);
});

test("an Organisation describes 20 Forms in 24 hours; the 21st is refused, even after a discard", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const create = (slug: string, user: typeof org.user) =>
    user.mutation(api.formProposals.createFromDescription, { organisationSlug: slug, description });

  const ids = [];
  for (let i = 0; i < MAX_DESCRIPTIONS_PER_DAY; i++) {
    ids.push((await create(org.slug, org.user)).proposalId);
  }
  await expect(create(org.slug, org.user)).rejects.toThrow(DESCRIPTIONS_PER_DAY_REACHED);
  expect(await org.rows.proposals()).toHaveLength(MAX_DESCRIPTIONS_PER_DAY);

  // A discarded description still counts: the 21st stays refused.
  await org.user.mutation(api.formProposals.discard, { organisationSlug: org.slug, proposalId: ids[0] });
  expect(await org.rows.proposals()).toHaveLength(MAX_DESCRIPTIONS_PER_DAY - 1);
  await expect(create(org.slug, org.user)).rejects.toThrow(DESCRIPTIONS_PER_DAY_REACHED);
  await settle(t);
});

test("another Organisation is not affected by the cap", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  for (let i = 0; i < MAX_DESCRIPTIONS_PER_DAY; i++) {
    await org.user.mutation(api.formProposals.createFromDescription, { organisationSlug: org.slug, description });
  }
  await expect(
    org.user.mutation(api.formProposals.createFromDescription, { organisationSlug: org.slug, description }),
  ).rejects.toThrow(DESCRIPTIONS_PER_DAY_REACHED);

  const eve = await signUp(t, "eve", "Evil Corp");
  const { proposalId } = await eve.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: eve.slug,
    description,
  });
  expect(proposalId).toBeDefined();
  await settle(t);
});

test("the cap is rolling: the slots come back 24 hours after each description", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const create = () =>
    org.user.mutation(api.formProposals.createFromDescription, { organisationSlug: org.slug, description });

  for (let i = 0; i < MAX_DESCRIPTIONS_PER_DAY; i++) await create();
  vi.setSystemTime(Date.now() + DESCRIPTION_WINDOW_MS - 60 * 1000);
  await expect(create()).rejects.toThrow(DESCRIPTIONS_PER_DAY_REACHED);

  vi.setSystemTime(Date.now() + 60 * 1000);
  await create();
  expect(await org.rows.proposals()).toHaveLength(MAX_DESCRIPTIONS_PER_DAY + 1);
  await settle(t);
});

test("a failed description shows a friendly failure and a retry proposes again, still without a Read", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  fakePipeline.failTimes("propose", 4);
  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description,
  });
  await settle(t);
  expect(await org.read(proposalId)).toMatchObject({ state: "failed", failure: "failed" });
  fakePipeline.calls = [];

  await org.user.mutation(api.formProposals.retry, { organisationSlug: org.slug, proposalId });
  await settle(t);

  expect((await org.read(proposalId)).state).toBe("ready");
  expect(fakePipeline.calls.map((c) => c.step)).toEqual(["describe"]);
  expect(await org.used()).toBe(0);
});

test("a description that proposes nothing is ready with no Fields; the Admin can still discard it", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay({ ...complaint, proposal: [] });
  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description,
  });
  await settle(t);

  expect(await org.read(proposalId)).toMatchObject({ state: "ready", fields: [] });
  await org.user.mutation(api.formProposals.discard, { organisationSlug: org.slug, proposalId });
  expect(await org.rows.proposals()).toEqual([]);
});

test("an unsaved description goes after 7 days like any proposal", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description,
  });
  await settle(t);
  const later = async (days: number) => {
    vi.setSystemTime(Date.now() + days * 24 * 60 * 60 * 1000);
    await t.mutation(internal.retention.run, {});
    await settle(t);
  };

  await later(6);
  expect((await org.read(proposalId)).state).toBe("ready");

  await later(2);
  await expect(org.read(proposalId)).rejects.toThrow("Form Proposal not found");
});

test("only an Admin can describe a Form, and nobody sees another Organisation's description", async () => {
  const t = newBackend();
  const org = await klachten(t);
  fakePipeline.replay(complaint);
  const bob = await addMembership(t, "bob", org.slug, "member");
  await expect(
    bob.mutation(api.formProposals.createFromDescription, { organisationSlug: org.slug, description }),
  ).rejects.toThrow("Forbidden");
  await expect(
    bob.action(api.formProposals.createFromEmail, { organisationSlug: org.slug, body: "hallo" }),
  ).rejects.toThrow("Forbidden");

  const { proposalId } = await org.user.mutation(api.formProposals.createFromDescription, {
    organisationSlug: org.slug,
    description,
  });
  const eve = await signUp(t, "eve", "Evil Corp");
  await expect(
    eve.user.query(api.formProposals.get, { organisationSlug: eve.slug, proposalId }),
  ).rejects.toThrow("Form Proposal not found");
});
