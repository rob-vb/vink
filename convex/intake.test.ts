import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { UNSUPPORTED_TYPE } from "./intake";
import {
  addMembership,
  fakePdfStore,
  newBackend,
  pdfWithPages,
  signUp,
} from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));

vi.mock("./lib/splitter", async () => ({
  splitter: (await import("./test.setup")).fakeSplitter,
}));

type Backend = ReturnType<typeof newBackend>;

const HOUR = 60 * 60 * 1000;

let sent: { to: string[]; subject: string; html: string }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  fakePdfStore.objects.clear();
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

/** Kantoor Noord with an Invoice Form, Ann as Admin and Cas as Member. */
async function kantoorNoord(t: Backend, { plan }: { plan?: "internal_unlimited" | null } = {}) {
  const ann = await signUp(t, "ann", "Kantoor Noord", { plan });
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  const cas = await addMembership(t, "cas", ann.slug, "member");
  const on = { organisationSlug: ann.slug, formId };
  return { ann: ann.user, cas, on, formId };
}

async function switchedOn(t: Backend, options?: { plan?: "internal_unlimited" | null }) {
  const org = await kantoorNoord(t, options);
  await org.ann.mutation(api.intake.switchOn, org.on);
  const { address } = (await org.cas.query(api.intake.get, org.on))!;
  const token = address!.split("@")[0];
  return { ...org, address: address!, token };
}

/** What the Cloudflare Worker does: PDFs into R2, then one call per email. */
async function email(
  t: Backend,
  token: string,
  attachments: Array<{ filename: string; pages?: number; bytes?: Uint8Array } | { filename: string; skipped: string }>,
  { secret = "intake-secret", from = "facturen@hoekstra.nl" } = {},
) {
  const entries = [];
  for (const attachment of attachments) {
    if ("skipped" in attachment) {
      entries.push(attachment);
      continue;
    }
    const key = `intake/${crypto.randomUUID()}`;
    fakePdfStore.objects.set(key, attachment.bytes ?? (await pdfWithPages(attachment.pages ?? 1)));
    entries.push({ key, filename: attachment.filename });
  }
  const response = await t.fetch("/intake/email", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ token, from, receivedAt: Date.now(), attachments: entries }),
  });
  return { response, keys: entries.flatMap((e) => ("key" in e ? [e.key] : [])) };
}

async function documents(t: Backend) {
  return await t.run(async (ctx) => await ctx.db.query("documents").collect());
}

test("an Admin switches the Intake Address on; every Member can read it", async () => {
  const t = newBackend();
  const { ann, cas, on } = await kantoorNoord(t);
  expect(await cas.query(api.intake.get, on)).toMatchObject({ address: null });

  await ann.mutation(api.intake.switchOn, on);

  const { address } = (await cas.query(api.intake.get, on))!;
  expect(address).toMatch(/^[a-z0-9]{20,}@in\.vink\.test$/);
});

test("Members can't switch the Intake Address on, off or replace it", async () => {
  const t = newBackend();
  const { ann, cas, on } = await kantoorNoord(t);
  await expect(cas.mutation(api.intake.switchOn, on)).rejects.toThrow("Forbidden");
  await ann.mutation(api.intake.switchOn, on);
  await expect(cas.mutation(api.intake.replace, on)).rejects.toThrow("Forbidden");
  await expect(cas.mutation(api.intake.switchOff, on)).rejects.toThrow("Forbidden");
});

test("another Organisation can't read or change a Form's Intake Address", async () => {
  const t = newBackend();
  const { on } = await switchedOn(t);
  const bob = await signUp(t, "bob", "Van Dijk");

  await expect(
    bob.user.query(api.intake.get, { ...on, organisationSlug: bob.slug }),
  ).rejects.toThrow(ConvexError);
});

test("each PDF attached to an email becomes its own Document of that Form", async () => {
  const t = newBackend();
  const { token, formId } = await switchedOn(t);

  const { response } = await email(t, token, [
    { filename: "F-118.pdf", pages: 2 },
    { filename: "F-119.pdf", pages: 1 },
  ]);

  expect(response.status).toBe(200);
  const created = await documents(t);
  expect(created.map((d) => [d.filename, d.formId, d.pageCount, d.uploaderEmail])).toEqual([
    ["F-118.pdf", formId, 2, "email from facturen@hoekstra.nl"],
    ["F-119.pdf", formId, 1, "email from facturen@hoekstra.nl"],
  ]);
});

test("a wrong secret or an unknown address is refused and creates nothing", async () => {
  const t = newBackend();
  const { token } = await switchedOn(t);

  const wrongSecret = await email(t, token, [{ filename: "a.pdf" }], { secret: "guess" });
  const unknown = await email(t, "nosuchtoken0000000000", [{ filename: "a.pdf" }]);

  expect(wrongSecret.response.status).toBe(401);
  expect(unknown.response.status).toBe(404);
  expect(await documents(t)).toHaveLength(0);
  // What the Worker stored for an unknown address is removed.
  for (const key of unknown.keys) expect(fakePdfStore.objects.has(key)).toBe(false);
});

test("replacing the Intake Address stops the old one at once", async () => {
  const t = newBackend();
  const { ann, cas, on, token } = await switchedOn(t);

  await ann.mutation(api.intake.replace, on);

  const { address } = (await cas.query(api.intake.get, on))!;
  expect(address!.split("@")[0]).not.toBe(token);
  expect((await email(t, token, [{ filename: "a.pdf" }])).response.status).toBe(404);
  expect((await email(t, address!.split("@")[0], [{ filename: "a.pdf" }])).response.status).toBe(
    200,
  );
});

test("switched off, the address stops working", async () => {
  const t = newBackend();
  const { ann, on, token } = await switchedOn(t);

  await ann.mutation(api.intake.switchOff, on);

  expect((await email(t, token, [{ filename: "a.pdf" }])).response.status).toBe(404);
});

test("each attachment has its own outcome in Recent emails; refused PDFs are deleted", async () => {
  const t = newBackend();
  const { cas, on, token } = await switchedOn(t);

  const { keys } = await email(t, token, [
    { filename: "F-118.pdf", pages: 1 },
    { filename: "manual.pdf", pages: 21 },
    { filename: "broken.pdf", bytes: new TextEncoder().encode("not a pdf") },
    { filename: "photo.jpg", skipped: "unsupported_type" },
    { filename: "huge.pdf", skipped: "too_large" },
  ]);

  const { recentEmails } = (await cas.query(api.intake.get, on))!;
  expect(recentEmails).toHaveLength(1);
  expect(recentEmails[0]).toMatchObject({
    from: "facturen@hoekstra.nl",
    attachments: [
      { filename: "F-118.pdf", outcome: "created", reason: null },
      {
        filename: "manual.pdf",
        outcome: "refused",
        reason: "This PDF has 21 pages. Vink reads up to 20 pages per Document.",
      },
      { filename: "broken.pdf", outcome: "refused", reason: "This file isn't a PDF Vink can read." },
      { filename: "photo.jpg", outcome: "refused", reason: UNSUPPORTED_TYPE },
      { filename: "huge.pdf", outcome: "refused", reason: "The PDF is larger than 10 MB." },
    ],
  });
  expect(await documents(t)).toHaveLength(1);
  expect(fakePdfStore.objects.has(keys[0])).toBe(true);
  expect(fakePdfStore.objects.has(keys[1])).toBe(false);
  expect(fakePdfStore.objects.has(keys[2])).toBe(false);
  // Vink never replies to the sender.
  expect(sent.filter((m) => m.to.includes("facturen@hoekstra.nl"))).toHaveLength(0);
});

test("Recent emails keeps the last 50 per Form", async () => {
  const t = newBackend();
  const { cas, on, token } = await switchedOn(t);

  for (let i = 0; i < 52; i++) {
    await email(t, token, [{ filename: `mail-${i}.jpg`, skipped: "unsupported_type" }]);
    vi.advanceTimersByTime(1000);
  }

  const { recentEmails } = (await cas.query(api.intake.get, on))!;
  expect(recentEmails).toHaveLength(50);
  expect(recentEmails[0].attachments[0].filename).toBe("mail-51.jpg");
  expect(recentEmails[49].attachments[0].filename).toBe("mail-2.jpg");
});

test("out of Items, emailed PDFs are refused and Admins hear once a day", async () => {
  const t = newBackend();
  const { token, cas, on } = await switchedOn(t, { plan: null });

  await email(t, token, [{ filename: "big.pdf", pages: 15 }]);
  await email(t, token, [{ filename: "next.pdf", pages: 8 }]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await email(t, token, [{ filename: "again.pdf", pages: 8 }]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const { recentEmails } = (await cas.query(api.intake.get, on))!;
  expect(recentEmails[0].attachments[0]).toMatchObject({
    outcome: "refused",
    reason: "You have 5 items left; this PDF needs 8.",
  });
  const alerts = () => sent.filter((m) => m.subject.includes("being refused"));
  expect(alerts()).toHaveLength(1);
  expect(alerts()[0]).toMatchObject({
    to: ["ann@example.com"],
    subject: "Emails to Invoice are being refused: out of Items",
  });
  expect(alerts()[0].html).toContain("/contact");

  vi.advanceTimersByTime(25 * HOUR);
  await email(t, token, [{ filename: "tomorrow.pdf", pages: 8 }]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(alerts()).toHaveLength(2);
});

test("an alert stamp still under its old name (before the Item backfill) still holds back the next alert", async () => {
  const t = newBackend();
  const { token } = await switchedOn(t, { plan: null });
  await t.run(async (ctx) => {
    const address = (await ctx.db.query("intakeAddresses").collect())[0];
    await ctx.db.patch(address._id, { outOfPagesAlertAt: Date.now() - HOUR });
  });

  await email(t, token, [{ filename: "big.pdf", pages: 15 }]);
  await email(t, token, [{ filename: "next.pdf", pages: 8 }]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(sent.filter((m) => m.subject.includes("being refused"))).toHaveLength(0);
});

test("an Intake Address belongs to one Form only", async () => {
  const t = newBackend();
  const { ann, on } = await switchedOn(t);
  const first = (await ann.query(api.intake.get, on))!.address;

  // Switching on again keeps the same address.
  await ann.mutation(api.intake.switchOn, on);

  expect((await ann.query(api.intake.get, on))!.address).toBe(first);
  const count = await t.run(async (ctx) => (await ctx.db.query("intakeAddresses").collect()).length);
  expect(count).toBe(1);
});
