// Step 7 of the "any input" plan: the app's upload takes a PDF, a JPG, PNG or
// HEIC image, an .eml file and pasted email text, with or without a Form. The
// kind comes from the file's first bytes, never from its name.
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
  fakePdfStore.types.clear();
  fakePipeline.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

const invoice: Recording = {
  reading: { supplier: { name: "Hoekstra Installatie", _pages: [1] } },
  matches: { supplier_name: { path: "supplier.name", probability: 0.97 } },
  fills: { supplier_name: "Hoekstra Installatie" },
  route: "Invoice",
};

/** An Organisation on Free Items (20), with one Invoice Form. */
async function hoekstra(t: Backend) {
  const ann = await signUp(t, "ann", "Hoekstra Installatie", { plan: null });
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    description: "Supplier invoices",
    fields: [{ type: "text", label: "Leverancier", key: "supplier_name", required: true }],
  });
  return { ...ann, formId };
}

type Org = Awaited<ReturnType<typeof hoekstra>>;

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const heic = () =>
  new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1")]);

/** What the upload dialog does for a file: get an upload URL, PUT the bytes, create the Submission. */
async function upload(org: Org, filename: string, bytes: Uint8Array, formId?: Id<"forms">) {
  const { key, url } = await org.user.mutation(api.submissions.generateUploadUrl, { organisationSlug: org.slug });
  putToUploadUrl(url, bytes);
  await org.user.action(api.submissions.create, { organisationSlug: org.slug, formId, key, filename });
  return key;
}

const submissions = (t: Backend) => t.run(async (ctx) => await ctx.db.query("submissions").collect());
const used = async (org: Org) => (await org.user.query(api.items.usage, { organisationSlug: org.slug })).used;

test.each([
  ["scan.jpg", jpeg(), "image/jpeg"],
  ["scan.png", png(), "image/png"],
  ["IMG_0042.HEIC", heic(), "image/heic"],
])("a photo (%s) without a Form is an image Submission of 1 Item, and the Router picks the Form", async (name, bytes, mimeType) => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  const key = await upload(org, name, bytes);

  const [submission] = await submissions(t);
  expect(submission).toMatchObject({ kind: "image", mimeType, filename: name, key, pageCount: 1, state: "extracting" });
  expect(submission.formId).toBeUndefined();
  expect(await used(org)).toBe(1);
  await settle(t);
  expect(fakePipeline.reads).toEqual([{ kind: "image", bytes, mimeType }]);
  expect(fakePipeline.calls.map((c) => c.step)).toContain("route");
  expect(await t.run(async (ctx) => (await ctx.db.get(submission._id))!.formId)).toBe(org.formId);
});

test("a photo with a chosen Form skips the Router", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  await upload(org, "bon.jpg", jpeg(), org.formId);
  await settle(t);

  const [submission] = await submissions(t);
  expect(submission).toMatchObject({ kind: "image", formId: org.formId, state: "needs_review" });
  expect(fakePipeline.calls.map((c) => c.step)).not.toContain("route");
});

test("the bytes decide the kind, not the file name: PNG bytes named .pdf are a PNG", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  await upload(org, "scan.pdf", png(), org.formId);

  expect(await submissions(t)).toMatchObject([{ kind: "image", mimeType: "image/png", filename: "scan.pdf" }]);
});

test("a PDF without a Form is still a PDF Submission of its pages", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  await upload(org, "factuur.pdf", await pdfWithPages(3));

  expect(await submissions(t)).toMatchObject([{ kind: "pdf", mimeType: "application/pdf", pageCount: 3 }]);
  expect(await used(org)).toBe(3);
});

test("an image over 10 MB is refused, and nothing is stored or charged", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  const big = new Uint8Array(10 * 1024 * 1024 + 1);
  big.set(jpeg());

  await expect(upload(org, "huge.jpg", big)).rejects.toThrow("The image is larger than 10 MB.");

  expect(await submissions(t)).toEqual([]);
  expect(fakePdfStore.objects.size).toBe(0);
  expect(await used(org)).toBe(0);
});

test("a file that is none of PDF, JPG, PNG, HEIC or an email is unsupported, and removed", async () => {
  const t = newBackend();
  const org = await hoekstra(t);

  await expect(upload(org, "notes.txt", new TextEncoder().encode("hello"))).rejects.toThrow(
    "this file type isn't supported",
  );
  // A random text file named .eml is no email either.
  await expect(upload(org, "notes.eml", new TextEncoder().encode("hello there\nno headers"))).rejects.toThrow(
    "this file type isn't supported",
  );
  // Named as a PDF, and it is not one.
  await expect(upload(org, "scan.pdf", new TextEncoder().encode("hello"))).rejects.toThrow(
    "This file isn't a PDF Vink can read.",
  );

  expect(await submissions(t)).toEqual([]);
  expect(fakePdfStore.objects.size).toBe(0);
});

test("pasted email text becomes an email Submission of 1 Item, written by the server, and the Router picks the Form", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  await org.user.action(api.submissions.createEmail, {
    organisationSlug: org.slug,
    subject: "Factuur F2026-0412",
    body: "Goedemiddag, het totaal is 151,25 euro.",
  });

  const [submission] = await submissions(t);
  expect(submission).toMatchObject({
    kind: "email",
    mimeType: "application/json",
    filename: "Factuur F2026-0412",
    pageCount: 1,
    state: "extracting",
  });
  expect(submission.key.startsWith(`${submission.organisationId}/`)).toBe(true);
  expect(JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(submission.key)))).toEqual({
    subject: "Factuur F2026-0412",
    from: "",
    date: "",
    body: "Goedemiddag, het totaal is 151,25 euro.",
    attachments: [],
  });
  expect(await used(org)).toBe(1);
  await settle(t);
  expect(fakePipeline.reads).toMatchObject([{ kind: "email", subject: "Factuur F2026-0412", attachments: [] }]);
  expect(fakePipeline.calls.map((c) => c.step)).toContain("route");
});

test("pasted email text needs no subject, and none is not an email", async () => {
  const t = newBackend();
  const org = await hoekstra(t);

  await org.user.action(api.submissions.createEmail, { organisationSlug: org.slug, formId: org.formId, body: "Totaal 12 euro" });
  await expect(
    org.user.action(api.submissions.createEmail, { organisationSlug: org.slug, body: "  \n " }),
  ).rejects.toThrow("This email has no text and no attachments.");

  expect(await submissions(t)).toMatchObject([{ kind: "email", filename: "Email", formId: org.formId }]);
  expect(await used(org)).toBe(1);
});

test("pasted email text over 200 KB is refused", async () => {
  const t = newBackend();
  const org = await hoekstra(t);

  await expect(
    org.user.action(api.submissions.createEmail, { organisationSlug: org.slug, body: "x".repeat(200 * 1024 + 1) }),
  ).rejects.toThrow("The email text is longer than 200 KB.");

  expect(await submissions(t)).toEqual([]);
  expect(fakePdfStore.objects.size).toBe(0);
});

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

async function eml(parts: { pdfPages?: number; docx?: boolean; body?: string }) {
  const lines = [
    "From: =?UTF-8?Q?Bakkerij_De_W=C3=AFt?= <info@dewit.example>",
    "To: facturen@hoekstra.example",
    "Subject: =?UTF-8?B?RmFjdHV1ciBva3RvYmVy?=",
    "Date: Tue, 06 Oct 2026 09:00:00 +0200",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="b1"',
    "",
    "--b1",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    parts.body ?? "Het totaal is =E2=82=AC 151,25.",
    "--b1",
  ];
  if (parts.pdfPages) {
    lines.push(
      'Content-Type: application/pdf; name="factuur.pdf"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="factuur.pdf"',
      "",
      base64(await pdfWithPages(parts.pdfPages)),
      "--b1",
    );
  }
  if (parts.docx) {
    lines.push(
      'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="kaart.docx"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="kaart.docx"',
      "",
      base64(new TextEncoder().encode("PK not really")),
      "--b1",
    );
  }
  lines[lines.length - 1] = "--b1--";
  return new TextEncoder().encode(lines.join("\r\n") + "\r\n");
}

test("an .eml file becomes one email Submission: its text and PDF attachment, charged as 1 + the PDF's pages", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  fakePipeline.replay(invoice);

  const rawKey = await upload(org, "mail.eml", await eml({ pdfPages: 2, docx: true }));

  const [submission] = await submissions(t);
  expect(submission).toMatchObject({ kind: "email", mimeType: "application/json", filename: "Factuur oktober" });
  expect(submission.key).not.toBe(rawKey);
  const stored = JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(submission.key)));
  expect(stored).toMatchObject({
    subject: "Factuur oktober",
    from: "Bakkerij De Wït <info@dewit.example>",
    date: "2026-10-06T07:00:00.000Z",
    body: "Het totaal is € 151,25.",
    // The Word file is not read.
    attachments: [{ filename: "factuur.pdf", mimeType: "application/pdf", key: `${submission.key}/1` }],
  });
  expect(submission.attachmentKeys).toEqual([`${submission.key}/1`]);
  expect(fakePdfStore.types.get(`${submission.key}/1`)).toBe("application/pdf");
  // The raw upload is gone; the email and its attachment remain.
  expect(fakePdfStore.objects.has(rawKey)).toBe(false);
  expect(fakePdfStore.objects.size).toBe(2);
  expect(await used(org)).toBe(3);
  // The raw upload is no orphan any more.
  expect(await t.run(async (ctx) => await ctx.db.query("uploads").collect())).toEqual([]);

  await settle(t);
  expect(fakePipeline.reads).toMatchObject([{ kind: "email", subject: "Factuur oktober", attachments: [{ filename: "factuur.pdf" }] }]);
});

test("an email that does not fit the Items left is refused whole: nothing is stored", async () => {
  const t = newBackend();
  const org = await hoekstra(t);
  await upload(org, "groot.pdf", await pdfWithPages(18), org.formId);
  const before = fakePdfStore.objects.size;

  // 1 for the text and 3 for the PDF; 2 Items are left.
  await expect(upload(org, "mail.eml", await eml({ pdfPages: 3 }))).rejects.toMatchObject({
    data: { code: "out_of_items", remaining: 2, needed: 4 },
  });

  expect(await submissions(t)).toHaveLength(1);
  expect(fakePdfStore.objects.size).toBe(before);
  expect(await used(org)).toBe(18);
});
