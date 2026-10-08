// Email in, whole mails (ADR 0010, step 6): the text and the PDF and image
// attachments of one email, the Organisation Intake Address next to the Forms',
// and Jev's call on one Document or several. Jev (splitter, router), Reader,
// Matcher, Filler and Verifier are the fakes of test.setup.ts.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { itemCountOf } from "./lib/inputLimits";
import type { StoredEmail } from "./lib/readerInput";
import {
  addMembership,
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
vi.mock("./lib/reader", async () => ({ reader: (await import("./test.setup")).fakeReader }));
vi.mock("./lib/router", async () => ({ router: (await import("./test.setup")).fakeRouter }));
vi.mock("./lib/splitter", async () => ({ splitter: (await import("./test.setup")).fakeSplitter }));
vi.mock("./lib/matcher", async () => ({ matcher: (await import("./test.setup")).fakeMatcher }));
vi.mock("./lib/filler", async () => ({ filler: (await import("./test.setup")).fakeFiller }));
vi.mock("./lib/verifier", async () => ({ verifier: (await import("./test.setup")).fakeVerifier }));

type Backend = ReturnType<typeof newBackend>;

let sent: { to: string[]; subject: string }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T09:00:00Z"));
  fakePdfStore.objects.clear();
  fakePdfStore.types.clear();
  fakePipeline.reset();
  vi.stubEnv("INTAKE_SECRET", "intake-secret");
  vi.stubEnv("INBOUND_DOMAIN", "in.vink.test");
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

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);
const bytes = (text: string) => new TextEncoder().encode(text);
const photo = bytes("jpeg bytes");

const complaint: Recording = {
  reading: { complaint: { subject: "Klacht over levering 4410", _pages: [1] }, photo: { number: "WB-2217", _pages: [2] } },
  matches: {
    subject: { path: "complaint.subject", probability: 0.99 },
    order_number: { path: "photo.number", probability: 0.9 },
  },
  fills: { subject: "Klacht over levering 4410", order_number: "WB-2217" },
  route: "Complaint",
  split: { answer: "together", probability: 0.95 },
};

/** Bakkerij De Wit on Free Items (so every charge shows), with an Invoice and a Complaint Form. */
async function bakkerij(t: Backend) {
  const ann = await signUp(t, "ann", "Bakkerij De Wit", { plan: null });
  const forms: Record<string, Id<"forms">> = {};
  for (const [name, fields] of [
    ["Invoice", [{ type: "text", label: "Leverancier", key: "supplier_name", required: true }]],
    [
      "Complaint",
      [
        { type: "text", label: "Onderwerp", key: "subject", required: true },
        { type: "text", label: "Werkbonnummer", key: "order_number", required: false },
      ],
    ],
  ] as const) {
    forms[name] = (
      await ann.user.mutation(api.forms.create, {
        organisationSlug: ann.slug,
        name,
        description: name === "Invoice" ? "Supplier invoices" : "Customer complaints",
        fields: [...fields],
      })
    ).formId;
  }
  const cas = await addMembership(t, "cas", ann.slug, "member");
  const organisationId = await t.run(async (ctx) => (await ctx.db.query("organisations").first())!._id);
  return { ...ann, cas, forms, organisationId };
}

type Org = Awaited<ReturnType<typeof bakkerij>>;

async function organisationAddress(org: Org) {
  await org.user.mutation(api.intake.switchOn, { organisationSlug: org.slug });
  const { address } = await org.cas.query(api.intake.get, { organisationSlug: org.slug });
  return address!.split("@")[0];
}

async function formAddress(org: Org, name: string) {
  const on = { organisationSlug: org.slug, formId: org.forms[name] };
  await org.user.mutation(api.intake.switchOn, on);
  return (await org.cas.query(api.intake.get, on)).address!.split("@")[0];
}

type Part = {
  filename: string;
  pages?: number;
  mimeType?: string;
  bytes?: Uint8Array;
  skipped?: string;
};

/** What the Worker does: attachments into R2, then one call per email. */
async function mail(
  t: Backend,
  token: string,
  { subject = "", body = "", parts = [], ...more }: { subject?: string; body?: string; parts?: Part[]; bodyTooLarge?: boolean },
) {
  const attachments = [];
  const keys: string[] = [];
  for (const part of parts) {
    if (part.skipped) {
      attachments.push({ filename: part.filename, skipped: part.skipped });
      continue;
    }
    const key = `intake/${crypto.randomUUID()}`;
    const mimeType = part.mimeType ?? "application/pdf";
    fakePdfStore.objects.set(
      key,
      part.bytes ?? (mimeType === "application/pdf" ? await pdfWithPages(part.pages ?? 1) : photo),
    );
    keys.push(key);
    attachments.push({ key, filename: part.filename, mimeType });
  }
  const response = await t.fetch("/intake/email", {
    method: "POST",
    headers: { Authorization: "Bearer intake-secret", "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      from: "anouk@bakkerij-dewit.example",
      receivedAt: Date.now(),
      subject,
      date: "2026-10-06T07:12:00.000Z",
      body,
      attachments,
      ...more,
    }),
  });
  await settle(t);
  return { response, keys };
}

const documents = (t: Backend) => t.run(async (ctx) => await ctx.db.query("documents").collect());
const used = async (org: Org) => (await org.user.query(api.items.usage, { organisationSlug: org.slug })).used;
const read = (org: Org, documentId: Id<"documents">) =>
  org.user.query(api.documents.get, { organisationSlug: org.slug, documentId });
const steps = () => fakePipeline.calls.map((c) => c.step);

test("the Organisation Intake Address: an Admin switches it on, replaces it and switches it off; a Member can read it", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const on = { organisationSlug: org.slug };
  expect(await org.cas.query(api.intake.get, on)).toMatchObject({ address: null });
  await expect(org.cas.mutation(api.intake.switchOn, on)).rejects.toThrow("Forbidden");

  const token = await organisationAddress(org);
  const formToken = await formAddress(org, "Invoice");
  expect(token).not.toBe(formToken);
  await expect(org.cas.mutation(api.intake.replace, on)).rejects.toThrow("Forbidden");
  await expect(org.cas.mutation(api.intake.switchOff, on)).rejects.toThrow("Forbidden");

  // Switching on again keeps the address; replacing stops the old one at once; the Form's is its own.
  await org.user.mutation(api.intake.switchOn, on);
  expect((await org.cas.query(api.intake.get, on)).address).toBe(`${token}@in.vink.test`);
  await org.user.mutation(api.intake.replace, on);
  const replaced = (await org.cas.query(api.intake.get, on)).address!.split("@")[0];
  expect(replaced).not.toBe(token);
  expect((await mail(t, token, { body: "Hallo" })).response.status).toBe(404);
  expect((await mail(t, replaced, { body: "Hallo" })).response.status).toBe(200);
  expect((await mail(t, formToken, { body: "Hallo" })).response.status).toBe(200);

  await org.user.mutation(api.intake.switchOff, on);
  expect((await mail(t, replaced, { body: "Hallo" })).response.status).toBe(404);
  expect((await org.cas.query(api.intake.get, { ...on, formId: org.forms.Invoice })).address).toBe(`${formToken}@in.vink.test`);
});

test("complaint + photo to the Organisation address: one Document of 2 Items, and the Router picks the Form", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await organisationAddress(org);
  fakePipeline.replay(complaint);

  const { response, keys } = await mail(t, token, {
    subject: "Klacht over levering 4410",
    body: "De levering van gisteren was onvolledig, zie de werkbon.",
    parts: [{ filename: "werkbon.jpg", mimeType: "image/jpeg" }],
  });

  expect(response.status).toBe(200);
  const [document] = await documents(t);
  expect(await documents(t)).toHaveLength(1);
  expect(document).toMatchObject({
    kind: "email",
    mimeType: "application/json",
    filename: "Klacht over levering 4410",
    uploaderEmail: "email from anouk@bakkerij-dewit.example",
  });
  expect(document.splitReason).toBeUndefined();
  expect(await used(org)).toBe(2);
  // Jev decided on the split, then the Router picked the Form.
  expect(steps()).toEqual(["split", "read", "route", "match", "fill", "verify"]);
  expect(fakePipeline.calls[0]).toMatchObject({
    step: "split",
    mail: { subject: "Klacht over levering 4410", attachments: [{ filename: "werkbon.jpg", kind: "image", pageCount: null }] },
  });
  expect(await read(org, document._id)).toMatchObject({ state: "needs_review", formName: "Complaint" });

  // The server wrote the email's file under the Organisation's prefix, the attachment beside it.
  expect(document.key.startsWith(`${org.organisationId}/`)).toBe(true);
  expect(document.attachmentKeys).toEqual([`${document.key}/1`]);
  const stored = JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(document.key)!)) as StoredEmail;
  expect(stored).toEqual({
    subject: "Klacht over levering 4410",
    from: "anouk@bakkerij-dewit.example",
    date: "2026-10-06T07:12:00.000Z",
    body: "De levering van gisteren was onvolledig, zie de werkbon.",
    attachments: [{ filename: "werkbon.jpg", mimeType: "image/jpeg", key: `${document.key}/1` }],
  });
  expect(fakePdfStore.objects.get(`${document.key}/1`)).toEqual(photo);
  expect(fakePdfStore.types.get(`${document.key}/1`)).toBe("image/jpeg");
  // What the Worker stored was moved, not kept twice.
  expect(fakePdfStore.objects.has(keys[0])).toBe(false);
});

test("the same mail to a Form's address goes to that Form and the Router is skipped", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  fakePipeline.replay({ ...complaint, route: "Invoice" });

  await mail(t, token, {
    subject: "Klacht",
    body: "De levering was onvolledig.",
    parts: [{ filename: "werkbon.jpg", mimeType: "image/jpeg" }],
  });

  const [document] = await documents(t);
  expect(document.formId).toBe(org.forms.Complaint);
  expect(steps()).not.toContain("route");
  expect(await read(org, document._id)).toMatchObject({ formName: "Complaint" });
  expect(await used(org)).toBe(2);
});

test("an empty body with 3 PDFs: Jev says apart, 3 Documents, and the Items are their pages", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Invoice");
  fakePipeline.replay({ ...complaint, split: { answer: "apart", probability: 0.93 } });

  await mail(t, token, {
    subject: "Facturen oktober",
    parts: [
      { filename: "F-118.pdf", pages: 2 },
      { filename: "F-119.pdf", pages: 1 },
      { filename: "F-120.pdf", pages: 3 },
    ],
  });

  const created = await documents(t);
  expect(created.map((d) => [d.filename, d.kind, d.pageCount, d.formId])).toEqual([
    ["F-118.pdf", "pdf", 2, org.forms.Invoice],
    ["F-119.pdf", "pdf", 1, org.forms.Invoice],
    ["F-120.pdf", "pdf", 3, org.forms.Invoice],
  ]);
  expect(created.every((d) => d.splitReason === undefined)).toBe(true);
  expect(await used(org)).toBe(6);
  const asked = fakePipeline.calls.find((c) => c.step === "split");
  expect(asked).toMatchObject({
    mail: { attachments: [{ pageCount: 2 }, { pageCount: 1 }, { pageCount: 3 }], body: "" },
  });
});

test("an ambiguous mail is split, and every Document is marked Needs Review with the reason", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  fakePipeline.replay({ ...complaint, split: { answer: "together", probability: 0.6 } });

  await mail(t, token, {
    subject: "Dingen",
    body: "Hierbij een klacht en een factuur.",
    parts: [
      { filename: "a.pdf", pages: 2 },
      { filename: "b.jpg", mimeType: "image/jpeg" },
    ],
  });

  const created = await documents(t);
  // The text, the PDF and the photo each on their own.
  expect(created.map((d) => [d.kind, d.filename])).toEqual([
    ["email", "Dingen"],
    ["pdf", "a.pdf"],
    ["image", "b.jpg"],
  ]);
  expect(await used(org)).toBe(4);
  for (const document of created) {
    expect(document.splitReason).toContain("not sure");
    expect(document.splitReason).toContain("60%");
    const view = await read(org, document._id);
    expect(view.state).toBe("needs_review");
    expect(view.history.find((h) => h.event === "mail_split")?.detail).toBe(document.splitReason);
  }
});

test("a split Vink was unsure about never goes through Auto-Send, a sure one does", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  await org.user.mutation(api.forms.updateSettings, {
    organisationSlug: org.slug,
    formId: org.forms.Complaint,
    reviewThreshold: 0.5,
    autoSend: true,
  });

  fakePipeline.replay({ ...complaint, split: { answer: "together", probability: 0.99 } });
  await mail(t, token, { body: "Klacht", parts: [{ filename: "werkbon.jpg", mimeType: "image/jpeg" }] });
  fakePipeline.replay({ ...complaint, split: { answer: "together", probability: 0.5 } });
  await mail(t, token, { body: "Klacht", parts: [{ filename: "werkbon.jpg", mimeType: "image/jpeg" }] });

  const states = await Promise.all((await documents(t)).map(async (d) => (await read(org, d._id)).state));
  // Sure: one email Document, approved by itself. Unsure: the text and the photo apart, both waiting.
  expect(states).toEqual(["approved", "needs_review", "needs_review"]);
});

test("a sure 'together' is not split, and a sure 'apart' is not flagged; the threshold is 80%", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");

  fakePipeline.replay({ ...complaint, split: { answer: "together", probability: 0.8 } });
  await mail(t, token, { body: "Klacht", parts: [{ filename: "a.pdf" }] });
  fakePipeline.replay({ ...complaint, split: { answer: "apart", probability: 0.79 } });
  await mail(t, token, { body: "Klacht", parts: [{ filename: "b.pdf" }] });

  const created = await documents(t);
  expect(created.map((d) => [d.kind, d.splitReason === undefined])).toEqual([
    ["email", true],
    ["email", false],
    ["pdf", false],
  ]);
});

test("a newsletter (text only) is one Document of 1 Item, with no call to Jev, and the Router may send it to No Form", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await organisationAddress(org);
  fakePipeline.replay({
    reading: { newsletter: { headline: "Herfstactie: 10% korting", _pages: [1] } },
    matches: {},
    fills: {},
  });

  await mail(t, token, { subject: "Onze herfstactie", body: "Alle broden 10% korting deze week! ".repeat(20) });

  const [document] = await documents(t);
  expect(await documents(t)).toHaveLength(1);
  expect(document.kind).toBe("email");
  expect(await used(org)).toBe(1);
  expect(steps()).not.toContain("split");
  expect(steps()).toContain("route");
  expect(await read(org, document._id)).toMatchObject({ state: "no_form" });
});

test("an empty mail creates no Document and costs nothing; neither does one with only unsupported files", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await organisationAddress(org);

  const empty = await mail(t, token, { subject: "Leeg", body: "  \n " });
  const files = await mail(t, token, {
    body: "",
    parts: [{ filename: "sheet.xlsx", skipped: "unsupported_type" }, { filename: "x.bmp", mimeType: "image/bmp" }],
  });

  expect([empty.response.status, files.response.status]).toEqual([200, 200]);
  expect(await documents(t)).toHaveLength(0);
  expect(await used(org)).toBe(0);
  expect(steps()).toEqual([]);
  const { recentEmails } = await org.cas.query(api.intake.get, { organisationSlug: org.slug });
  expect(recentEmails[0].attachments.map((a) => [a.filename, a.outcome])).toEqual([
    ["sheet.xlsx", "refused"],
    ["x.bmp", "refused"],
  ]);
  expect(recentEmails[1].attachments).toEqual([]);
  expect(fakePdfStore.objects.size).toBe(0);
});

test("whatever the split, the Items of a mail add up to itemCountOf of the whole mail, charged once", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  const whole = itemCountOf({
    kind: "email",
    body: "Zie bijlagen",
    attachments: [{ kind: "pdf", pageCount: 2 }, { kind: "pdf", pageCount: 1 }, { kind: "image" }],
  });
  expect(whole).toBe(5);
  const parts: Part[] = [
    { filename: "a.pdf", pages: 2 },
    { filename: "b.pdf", pages: 1 },
    { filename: "c.jpg", mimeType: "image/jpeg" },
  ];

  let before = 0;
  for (const split of [
    { answer: "together", probability: 0.99 },
    { answer: "apart", probability: 0.99 },
    { answer: "together", probability: 0.5 },
  ] as const) {
    fakePipeline.replay({ ...complaint, split });
    await mail(t, token, { body: "Zie bijlagen", parts });
    expect((await used(org)) - before).toBe(whole);
    before = await used(org);
  }
});

test("out of Items, the whole mail is refused: nothing is created, nothing is charged, files are removed", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Invoice");
  fakePipeline.replay({ ...complaint, split: { answer: "apart", probability: 0.99 } });

  // 20 Free Items: 15 + 8 do not fit together, though each would alone.
  const { keys } = await mail(t, token, {
    parts: [
      { filename: "big.pdf", pages: 15 },
      { filename: "next.pdf", pages: 8 },
    ],
  });
  await settle(t);

  expect(await documents(t)).toHaveLength(0);
  expect(await used(org)).toBe(0);
  for (const key of keys) expect(fakePdfStore.objects.has(key)).toBe(false);
  const { recentEmails } = await org.cas.query(api.intake.get, { organisationSlug: org.slug, formId: org.forms.Invoice });
  expect(recentEmails[0].attachments).toMatchObject([
    { filename: "big.pdf", outcome: "refused", reason: "You have 20 items left; this email needs 23." },
    { filename: "next.pdf", outcome: "refused", reason: "You have 20 items left; this email needs 23." },
  ]);
  expect(sent.filter((m) => m.subject === "Emails to Invoice are being refused: out of Items")).toHaveLength(1);
});

test("out of Items at the Organisation address: Admins hear about the Organisation Intake Address", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await organisationAddress(org);

  await mail(t, token, { parts: [{ filename: "big.pdf", pages: 20 }] });
  await mail(t, token, { parts: [{ filename: "next.pdf", pages: 2 }, { filename: "x.pdf", pages: 1 }] });

  expect(sent.filter((m) => m.subject === "Emails to the Organisation Intake Address are being refused: out of Items")).toHaveLength(1);
});

test("unsupported types, too many, too large and an over-long text are refused one by one; the rest goes on", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  fakePipeline.replay(complaint);
  const mb = (n: number) => new Uint8Array(n * 1024 * 1024);

  const { keys } = await mail(t, token, {
    subject: "Veel",
    body: "x".repeat(200 * 1024 + 1),
    parts: [
      { filename: "ok.pdf", pages: 1 },
      { filename: "doc.docx", skipped: "unsupported_type" },
      { filename: "huge.jpg", mimeType: "image/jpeg", bytes: new Uint8Array(10 * 1024 * 1024 + 1) },
      { filename: "weird.bmp", mimeType: "image/bmp" },
      { filename: "photo.png", mimeType: "image/png", bytes: mb(10) },
      { filename: "photo2.png", mimeType: "image/png", bytes: mb(10) },
      { filename: "broken.pdf", bytes: bytes("not a pdf") },
    ],
  });

  const { recentEmails } = await org.cas.query(api.intake.get, { organisationSlug: org.slug, formId: org.forms.Complaint });
  expect(recentEmails[0].attachments.map((a) => [a.filename, a.outcome, a.reason])).toEqual([
    ["Veel", "refused", "The email text is longer than 200 KB."],
    ["ok.pdf", "created", null],
    ["doc.docx", "refused", expect.stringContaining("isn't supported")],
    ["huge.jpg", "refused", "The image is larger than 10 MB."],
    ["weird.bmp", "refused", expect.stringContaining("isn't supported")],
    ["photo.png", "created", null],
    // 20 MB of photos: over 12 MB together.
    ["photo2.png", "refused", "The attachments of this email are larger than 12 MB together."],
    ["broken.pdf", "refused", "This file isn't a PDF Vink can read."],
  ]);
  // The text was refused; the PDF and the photo that were accepted are one case for Jev.
  expect((await documents(t)).map((d) => [d.kind, d.attachmentKeys?.length])).toEqual([["email", 2]]);
  expect(await used(org)).toBe(2);
  // What the Worker stored is gone: refused, or moved under the email's key.
  for (const key of keys) expect(fakePdfStore.objects.has(key)).toBe(false);
});

test("a mail takes at most 10 attachments", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Invoice");

  await mail(t, token, { parts: Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.pdf` })) });

  expect(await documents(t)).toHaveLength(10);
  const { recentEmails } = await org.cas.query(api.intake.get, { organisationSlug: org.slug, formId: org.forms.Invoice });
  expect(recentEmails[0].attachments[10]).toMatchObject({
    filename: "f10.pdf",
    outcome: "refused",
    reason: "Vink reads up to 10 attachments per email.",
  });
});

test("Jev being down creates nothing: the sender's server retries, and nothing is charged", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Invoice");
  fakePipeline.replay(complaint);
  fakePipeline.failOnce("split");

  const first = await mail(t, token, { body: "Zie bijlage", parts: [{ filename: "a.pdf" }] });

  expect(first.response.status).toBe(400);
  expect(await documents(t)).toHaveLength(0);
  expect(await used(org)).toBe(0);
});

test("deleting an email Document removes its file and its attachments", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await formAddress(org, "Complaint");
  fakePipeline.replay(complaint);
  await mail(t, token, {
    body: "Klacht",
    parts: [
      { filename: "werkbon.jpg", mimeType: "image/jpeg" },
      { filename: "bon.pdf" },
    ],
  });
  const [document] = await documents(t);
  expect(document.attachmentKeys).toHaveLength(2);
  // Another Organisation's file that a forged key list points at must stay.
  fakePdfStore.objects.set("otherorganisation/secret", photo);
  await t.run(async (ctx) =>
    ctx.db.patch(document._id, { attachmentKeys: [...document.attachmentKeys!, "otherorganisation/secret"] }),
  );
  expect(fakePdfStore.objects.has(document.key)).toBe(true);

  await org.user.mutation(api.rejection.remove, { organisationSlug: org.slug, documentId: document._id });

  expect(fakePdfStore.objects.has(document.key)).toBe(false);
  expect(fakePdfStore.objects.has(`${document.key}/1`)).toBe(false);
  expect(fakePdfStore.objects.has(`${document.key}/2`)).toBe(false);
  expect(fakePdfStore.objects.has("otherorganisation/secret")).toBe(true);
});

test("deleting the Organisation removes the files of an email Document and the Organisation address", async () => {
  const t = newBackend();
  const org = await bakkerij(t);
  const token = await organisationAddress(org);
  fakePipeline.replay(complaint);
  await mail(t, token, { body: "Klacht", parts: [{ filename: "werkbon.jpg", mimeType: "image/jpeg" }] });
  expect(fakePdfStore.objects.size).toBeGreaterThan(0);

  await org.user.action(api.deletion.deleteOrganisation, { organisationSlug: org.slug, confirmName: "Bakkerij De Wit" });
  await settle(t);

  expect(fakePdfStore.objects.size).toBe(0);
  expect(await t.run(async (ctx) => (await ctx.db.query("intakeAddresses").collect()).length)).toBe(0);
  expect(await t.run(async (ctx) => (await ctx.db.query("intakeEmails").collect()).length)).toBe(0);
  expect((await mail(t, token, { body: "Hallo" })).response.status).toBe(404);
});
