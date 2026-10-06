import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { openApiDocument } from "./openapi";
import { fakePdfStore, fakePipeline, newBackend, pdfWithPages, signUp, type Recording } from "../test.setup";

vi.mock("../lib/pdfStore", async () => ({
  pdfStore: (await import("../test.setup")).fakePdfStore,
}));
vi.mock("../lib/reader", async () => ({
  reader: (await import("../test.setup")).fakeReader,
}));
vi.mock("../lib/matcher", async () => ({
  matcher: (await import("../test.setup")).fakeMatcher,
}));
vi.mock("../lib/filler", async () => ({
  filler: (await import("../test.setup")).fakeFiller,
}));
vi.mock("../lib/verifier", async () => ({
  verifier: (await import("../test.setup")).fakeVerifier,
}));

type Backend = ReturnType<typeof newBackend>;

const invoice: Recording = {
  reading: { invoice: { number: "F-2026-118", _pages: [1] } },
  matches: { invoice_number: { path: "invoice.number", probability: 0.97 } },
  fills: { invoice_number: "F-2026-118" },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
  fakePdfStore.objects.clear();
  fakePipeline.reset();
  fakePipeline.replay(invoice);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Kantoor Noord with an Invoice Form and an API Key named "Zapier". */
async function kantoorNoord(t: Backend, { plan }: { plan?: "internal_unlimited" | null } = {}) {
  const ann = await signUp(t, "ann", "Kantoor Noord", { plan });
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Invoice",
    fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
  });
  const { key } = await ann.user.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  return { ann: ann.user, organisationSlug, formId, key };
}

async function send(
  t: Backend,
  path: string,
  key: string,
  body: BodyInit,
  headers: Record<string, string> = { "Content-Type": "application/pdf" },
) {
  const response = await t.fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, ...headers },
    body,
  });
  return { status: response.status, body: await response.json() };
}

test("a PDF sent as the request body becomes a Document of the Form, with the API Key's name as its source", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);

  const { status, body } = await send(
    t,
    `/v1/forms/${formId}/documents?filename=F-118.pdf`,
    key,
    await pdfWithPages(2),
  );

  expect(status).toBe(201);
  expect(body).toEqual({ id: expect.any(String), state: "processing" });
  expect(Object.keys(body)).toEqual(openApiDocument.components.schemas.SentDocument.required);
  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([
    { id: body.id, filename: "F-118.pdf", pageCount: 2, uploadedBy: "API: Zapier" },
  ]);
});

test("a PDF sent as multipart/form-data, as Zapier, Make and Power Automate send it, keeps its filename", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([await pdfWithPages(1)], { type: "application/octet-stream" }), "scans/F-119.pdf");

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  expect(status).toBe(201);
  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ id: body.id, filename: "F-119.pdf", pageCount: 1 }]);
});

test("a multipart `filename` part names the Document", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([await pdfWithPages(1)]), "blob");
  form.append("filename", "Werkbon 12.pdf");

  await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ filename: "Werkbon 12.pdf" }]);
});

test("the Document is processed like any other and its Pages are counted once", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });

  const { body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(3));
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "needs_review" });
  expect(documents.map((d) => d.id)).toEqual([body.id]);
  expect(await ann.query(api.pages.usage, { organisationSlug })).toMatchObject({ remaining: 17, used: 3 });
  expect(fakePdfStore.objects.size).toBe(1);
});

async function nothingCreated(t: Backend) {
  expect(await t.run(async (ctx) => await ctx.db.query("documents").collect())).toEqual([]);
  // A refused PDF isn't kept.
  expect(fakePdfStore.objects.size).toBe(0);
}

test("a file that isn't a PDF is refused with 415", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, "%PDF-not really");

  expect({ status, body }).toEqual({
    status: 415,
    body: { error: { code: "not_a_pdf", message: "This file isn't a PDF Vink can read." } },
  });
  await nothingCreated(t);
});

test("a body that is neither multipart/form-data nor a PDF is refused with 415", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, "{}", {
    "Content-Type": "application/json",
  });

  expect(status).toBe(415);
  expect(body.error.code).toBe("unsupported_media_type");
  await nothingCreated(t);
});

test("a request without a PDF in it is refused with 400", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("document", new Blob([await pdfWithPages(1)]), "F-1.pdf");

  const multipart = await send(t, `/v1/forms/${formId}/documents`, key, form, {});
  const empty = await send(t, `/v1/forms/${formId}/documents`, key, new Uint8Array());

  expect(multipart.status).toBe(400);
  expect(multipart.body.error.code).toBe("missing_file");
  expect(empty.status).toBe(400);
  await nothingCreated(t);
});

test("a PDF over 20 pages is refused with 422", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(21));

  expect({ status, body }).toEqual({
    status: 422,
    body: {
      error: { code: "too_many_pages", message: "This PDF has 21 pages. Vink reads up to 20 pages per Document." },
    },
  });
  await nothingCreated(t);
});

test("a body over 20 MB is refused with 413", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, new Uint8Array(20 * 1024 * 1024 + 1));

  expect(status).toBe(413);
  expect(body.error.code).toBe("file_too_large");
  await nothingCreated(t);
});

test("a PDF that doesn't fit the Pages left is refused with 402 and charges nothing", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });
  await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(15));

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(8));

  expect({ status, body }).toEqual({
    status: 402,
    body: { error: { code: "out_of_pages", message: "You have 5 pages left; this PDF has 8." } },
  });
  expect(await ann.query(api.pages.usage, { organisationSlug })).toMatchObject({ remaining: 5 });
  expect(await t.run(async (ctx) => (await ctx.db.query("documents").collect()).length)).toBe(1);
  expect(fakePdfStore.objects.size).toBe(1);
});

test("an unknown Form, or another Organisation's, is 404", async () => {
  const t = newBackend();
  const { formId } = await kantoorNoord(t);
  const bob = await signUp(t, "bob", "Van Dijk");
  const { key: bobsKey } = await bob.user.mutation(api.apiKeys.create, {
    organisationSlug: bob.slug,
    name: "Make",
  });

  for (const id of [formId, "nope"]) {
    const { status, body } = await send(t, `/v1/forms/${id}/documents`, bobsKey, await pdfWithPages(1));
    expect({ status, body }).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "There's no such Form." } },
    });
  }
  await nothingCreated(t);
});

test("a revoked key can't send a Document in", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  const [{ id: apiKeyId }] = await ann.query(api.apiKeys.list, { organisationSlug });
  await ann.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(1));

  expect(status).toBe(401);
  expect(body.error.code).toBe("invalid_api_key");
  await nothingCreated(t);
});

test("the source still reads the key's name after the key is revoked", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  await send(t, `/v1/forms/${formId}/documents`, key, await pdfWithPages(1));
  const [{ id: apiKeyId }] = await ann.query(api.apiKeys.list, { organisationSlug });
  await ann.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ uploadedBy: "API: Zapier" }]);
});
