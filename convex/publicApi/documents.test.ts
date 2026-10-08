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
vi.mock("../lib/router", async () => ({
  router: (await import("../test.setup")).fakeRouter,
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

/** A PDF as fetch takes it as a body. */
async function pdf(pages: number) {
  return new Uint8Array(await pdfWithPages(pages));
}

const invoice: Recording = {
  reading: { invoice: { number: "F-2026-118", _pages: [1] } },
  matches: { invoice_number: { path: "invoice.number", probability: 0.97 } },
  fills: { invoice_number: "F-2026-118" },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
  fakePdfStore.objects.clear();
  fakePdfStore.types.clear();
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
    await pdf(2),
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
  form.append("file", new Blob([await pdf(1)], { type: "application/octet-stream" }), "scans/F-119.pdf");

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  expect(status).toBe(201);
  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ id: body.id, filename: "F-119.pdf", pageCount: 1 }]);
});

test("a multipart `filename` part names the Document", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([await pdf(1)]), "blob");
  form.append("filename", "Werkbon 12.pdf");

  await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ filename: "Werkbon 12.pdf" }]);
});

test("the Document is processed like any other and its Items are counted once", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });

  const { body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdf(3));
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "needs_review" });
  expect(documents.map((d) => d.id)).toEqual([body.id]);
  expect(await ann.query(api.items.usage, { organisationSlug })).toMatchObject({ remaining: 17, used: 3 });
  expect(fakePdfStore.objects.size).toBe(1);
  // The stored file carries its real MIME type, and the Document its kind.
  expect([...fakePdfStore.types.values()]).toEqual(["application/pdf"]);
  const stored = await t.run(async (ctx) => await ctx.db.query("documents").collect());
  expect(stored).toMatchObject([{ kind: "pdf", mimeType: "application/pdf" }]);
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

test("a body that is none of multipart/form-data, JSON or a file type is refused with 415", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, "hello", {
    "Content-Type": "text/plain",
  });

  expect(status).toBe(415);
  expect(body.error.code).toBe("unsupported_media_type");
  await nothingCreated(t);
});

test("a request without a PDF in it is refused with 400", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("document", new Blob([await pdf(1)]), "F-1.pdf");

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

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdf(21));

  expect({ status, body }).toEqual({
    status: 422,
    body: {
      error: { code: "too_many_pages", message: "This PDF has 21 pages. Vink reads up to 20 pages per Document." },
    },
  });
  await nothingCreated(t);
});

test("a body over 10 MB is refused with 413", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, new Uint8Array(10 * 1024 * 1024 + 1));

  expect({ status, body }).toEqual({
    status: 413,
    body: { error: { code: "file_too_large", message: "The file is larger than 10 MB." } },
  });
  await nothingCreated(t);
});

test("a PDF that doesn't fit the Items left is refused with 402 and charges nothing", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });
  await send(t, `/v1/forms/${formId}/documents`, key, await pdf(15));

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdf(8));

  expect({ status, body }).toEqual({
    status: 402,
    body: { error: { code: "out_of_items", message: "You have 5 items left; this PDF needs 8." } },
  });
  expect(await ann.query(api.items.usage, { organisationSlug })).toMatchObject({ remaining: 5 });
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
    const { status, body } = await send(t, `/v1/forms/${id}/documents`, bobsKey, await pdf(1));
    expect({ status, body }).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "There's no Form with that id in your Organisation." } },
    });
  }
  await nothingCreated(t);
});

test("a revoked key can't send a Document in", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  const [{ id: apiKeyId }] = await ann.query(api.apiKeys.list, { organisationSlug });
  await ann.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, await pdf(1));

  expect(status).toBe(401);
  expect(body.error.code).toBe("invalid_api_key");
  await nothingCreated(t);
});

test("the source still reads the key's name after the key is revoked", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  await send(t, `/v1/forms/${formId}/documents`, key, await pdf(1));
  const [{ id: apiKeyId }] = await ann.query(api.apiKeys.list, { organisationSlug });
  await ann.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });

  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "extracting" });
  expect(documents).toMatchObject([{ uploadedBy: "API: Zapier" }]);
});

// --- Any input: photos, emails, and no Form (ADR 0010) ---

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const heic = () =>
  new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1")]);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const stored = (t: Backend) => t.run(async (ctx) => await ctx.db.query("documents").collect());

test.each([
  ["image/jpeg", jpeg(), "image", "document.jpg"],
  ["image/png", png(), "image", "document.png"],
  ["image/heic", heic(), "image", "document.heic"],
  ["application/pdf", null, "pdf", "document.pdf"],
])("a %s body becomes a %s Document with its real type stored", async (contentType, bytes, kind, filename) => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const { status, body } = await send(t, `/v1/forms/${formId}/documents`, key, bytes ?? (await pdf(1)), {
    "Content-Type": contentType,
  });

  expect({ status, body }).toEqual({ status: 201, body: { id: expect.any(String), state: "processing" } });
  expect(await stored(t)).toMatchObject([{ kind, mimeType: contentType, filename, formId, pageCount: 1 }]);
  expect([...fakePdfStore.types.values()]).toEqual([contentType]);
});

test("a photo costs 1 Item", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });

  await send(t, `/v1/forms/${formId}/documents`, key, jpeg(), { "Content-Type": "image/jpeg" });

  expect(await ann.query(api.items.usage, { organisationSlug })).toMatchObject({ used: 1, remaining: 19 });
});

test("a multipart photo with no type of its own is read by its bytes and keeps its filename", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([png()], { type: "application/octet-stream" }), "scans/bon.png");

  const { status } = await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  expect(status).toBe(201);
  expect(await stored(t)).toMatchObject([{ kind: "image", mimeType: "image/png", filename: "bon.png" }]);
});

test("PNG bytes sent as application/pdf are refused with 415: the Content-Type contradicts the bytes", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const raw = await send(t, `/v1/forms/${formId}/documents`, key, png(), { "Content-Type": "application/pdf" });
  const form = new FormData();
  form.append("file", new Blob([png()], { type: "application/pdf" }), "scan.pdf");
  const multipart = await send(t, `/v1/forms/${formId}/documents`, key, form, {});
  const jpegAsPng = await send(t, `/v1/forms/${formId}/documents`, key, jpeg(), { "Content-Type": "image/png" });

  for (const answer of [raw, multipart, jpegAsPng]) {
    expect(answer.status).toBe(415);
    expect(answer.body.error.code).toBe("media_type_mismatch");
  }
  expect(raw.body.error.message).toBe(
    "The Content-Type is application/pdf, but the file is image/png. Send it with its own Content-Type, or as application/octet-stream.",
  );
  await nothingCreated(t);
});

test("an alias of the right type is no mismatch: image/jpg for a JPEG, image/heif for a HEIC", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);

  const a = await send(t, `/v1/forms/${formId}/documents`, key, jpeg(), { "Content-Type": "image/jpg" });
  const b = await send(t, `/v1/forms/${formId}/documents`, key, heic(), { "Content-Type": "image/heif" });

  expect([a.status, b.status]).toEqual([201, 201]);
  expect(await stored(t)).toMatchObject([{ mimeType: "image/jpeg" }, { mimeType: "image/heic" }]);
});

test("bytes that are none of PDF, JPG, PNG or HEIC are refused with 415, whatever the Content-Type says", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);

  const octet = await send(t, `/v1/forms/${formId}/documents`, key, zip, { "Content-Type": "application/octet-stream" });
  const typed = await send(t, `/v1/forms/${formId}/documents`, key, zip, { "Content-Type": "image/png" });
  const form = new FormData();
  form.append("file", new Blob([zip]), "all.zip");
  const multipart = await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  for (const answer of [octet, typed, multipart]) {
    expect(answer.status).toBe(415);
    expect(answer.body.error.code).toBe("unsupported_file_type");
  }
  await nothingCreated(t);
});

test("without a Form, the Router picks it after Read", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t);
  fakePipeline.replay({ ...invoice, route: "Invoice" });

  const { status, body } = await send(t, "/v1/documents", key, jpeg(), { "Content-Type": "image/jpeg" });

  expect({ status, body }).toEqual({ status: 201, body: { id: expect.any(String), state: "processing" } });
  const [document] = await stored(t);
  expect(document.formId).toBeUndefined();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fakePipeline.calls.map((c) => c.step)).toContain("route");
  const read = await t.fetch(`/v1/documents/${body.id}`, { headers: { Authorization: `Bearer ${key}` } });
  expect(await read.json()).toMatchObject({ id: body.id, form_id: formId, state: "needs_review" });
  const { documents } = await ann.query(api.documents.list, { organisationSlug, state: "needs_review" });
  expect(documents.map((d) => d.id)).toEqual([body.id]);
});

test("a Document no Form fits reads as form_id null, state no_form", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);
  fakePipeline.replay({ ...invoice, route: null });

  const { body } = await send(t, "/v1/documents", key, await pdf(1));
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const read = await t.fetch(`/v1/documents/${body.id}`, { headers: { Authorization: `Bearer ${key}` } });
  expect(await read.json()).toMatchObject({ id: body.id, form_id: null, state: "no_form", payload: null });
});

test("`form_id` names the Form on /v1/documents: in the query, in a multipart part, or in the email's JSON", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([await pdf(1)]), "a.pdf");
  form.append("form_id", formId);

  await send(t, `/v1/documents?form_id=${formId}`, key, jpeg(), { "Content-Type": "image/jpeg" });
  await send(t, "/v1/documents", key, form, {});
  await send(t, "/v1/documents", key, JSON.stringify({ body: "Totaal 12 euro", form_id: formId }), {
    "Content-Type": "application/json",
  });

  expect((await stored(t)).map((d) => d.formId)).toEqual([formId, formId, formId]);
});

test("an empty `form_id`, as Zapier sends an input left empty, means no Form", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([await pdf(1)]), "a.pdf");
  form.append("form_id", "");

  const { status } = await send(t, "/v1/documents", key, form, {});

  expect(status).toBe(201);
  expect((await stored(t))[0].formId).toBeUndefined();
});

test("a `form_id` that is not the Organisation's is 404, on /v1/documents too", async () => {
  const t = newBackend();
  const { formId } = await kantoorNoord(t);
  const bob = await signUp(t, "bob", "Van Dijk");
  const { key: bobsKey } = await bob.user.mutation(api.apiKeys.create, { organisationSlug: bob.slug, name: "Make" });

  for (const id of [formId, "nope"]) {
    const { status, body } = await send(t, `/v1/documents?form_id=${id}`, bobsKey, await pdf(1));
    expect({ status, body }).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "There's no Form with that id in your Organisation." } },
    });
  }
  await nothingCreated(t);
});

const json = { "Content-Type": "application/json" };

test("an email as JSON becomes an email Document: the text and its attachments, charged as 1 + their Items", async () => {
  const t = newBackend();
  const { ann, organisationSlug, formId, key } = await kantoorNoord(t, { plan: null });

  const { status, body } = await send(
    t,
    `/v1/forms/${formId}/documents`,
    key,
    JSON.stringify({
      subject: "Factuur F2026-0412",
      from: "boekhouding@hoekstra.example",
      date: "2026-10-06T09:00:00Z",
      body: "Het totaal is 151,25 euro.",
      attachments: [
        { filename: "factuur.pdf", content_base64: base64(await pdf(2)) },
        { filename: "bon.jpg", content_base64: base64(jpeg()) },
      ],
    }),
    json,
  );

  expect({ status, body }).toEqual({ status: 201, body: { id: expect.any(String), state: "processing" } });
  const [document] = await stored(t);
  expect(document).toMatchObject({ kind: "email", mimeType: "application/json", filename: "Factuur F2026-0412", formId });
  expect(JSON.parse(new TextDecoder().decode(fakePdfStore.objects.get(document.key)))).toEqual({
    subject: "Factuur F2026-0412",
    from: "boekhouding@hoekstra.example",
    date: "2026-10-06T09:00:00.000Z",
    body: "Het totaal is 151,25 euro.",
    attachments: [
      { filename: "factuur.pdf", mimeType: "application/pdf", key: `${document.key}/1`, pageCount: 2 },
      { filename: "bon.jpg", mimeType: "image/jpeg", key: `${document.key}/2`, pageCount: 1 },
    ],
  });
  // The text 1 + the PDF's 2 pages + the photo 1.
  expect(await ann.query(api.items.usage, { organisationSlug })).toMatchObject({ used: 4 });
  expect(fakePdfStore.objects.size).toBe(3);
});

test("an email with only a body needs no attachments and no subject", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);

  const { status } = await send(t, "/v1/documents", key, JSON.stringify({ body: "Totaal 12 euro" }), json);

  expect(status).toBe(201);
  expect(await stored(t)).toMatchObject([{ kind: "email", filename: "Email" }]);
});

test("an email without text and attachments is refused with 422", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);

  const { status, body } = await send(t, "/v1/documents", key, JSON.stringify({ subject: "Leeg", body: " " }), json);

  expect(status).toBe(422);
  expect(body.error.code).toBe("empty_email");
  await nothingCreated(t);
});

test("an email whose JSON or attachments are invalid is refused with 400 or 415, and nothing is stored", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);
  const zip = base64(new Uint8Array([0x50, 0x4b, 3, 4]));

  const notJson = await send(t, "/v1/documents", key, "{nope", json);
  const notObject = await send(t, "/v1/documents", key, "[]", json);
  const wrongType = await send(t, "/v1/documents", key, JSON.stringify({ body: 5 }), json);
  const badBase64 = await send(t, "/v1/documents", key, JSON.stringify({ attachments: [{ content_base64: "%%%" }] }), json);
  const noContent = await send(t, "/v1/documents", key, JSON.stringify({ attachments: [{ filename: "a.pdf" }] }), json);
  const unsupported = await send(
    t,
    "/v1/documents",
    key,
    JSON.stringify({ body: "Zie bijlage", attachments: [{ filename: "a.zip", content_base64: zip }] }),
    json,
  );

  for (const answer of [notJson, notObject, wrongType, badBase64, noContent]) {
    expect(answer.status).toBe(400);
    expect(answer.body.error.code).toBe("invalid_request");
  }
  expect(unsupported.status).toBe(415);
  expect(unsupported.body.error.code).toBe("unsupported_file_type");
  await nothingCreated(t);
});

test("an email with more than 10 attachments is refused with 422", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);
  const attachments = Array.from({ length: 11 }, (_, i) => ({ filename: `${i}.jpg`, content_base64: base64(jpeg()) }));

  const { status, body } = await send(t, "/v1/documents", key, JSON.stringify({ body: "Foto's", attachments }), json);

  expect(status).toBe(422);
  expect(body.error.code).toBe("too_many_attachments");
  await nothingCreated(t);
});

test("an email that does not fit the Items left is refused with 402 and stores nothing", async () => {
  const t = newBackend();
  const { key, formId } = await kantoorNoord(t, { plan: null });
  await send(t, `/v1/forms/${formId}/documents`, key, await pdf(19));

  const { status, body } = await send(
    t,
    "/v1/documents",
    key,
    JSON.stringify({ body: "Foto's", attachments: [{ filename: "a.jpg", content_base64: base64(jpeg()) }] }),
    json,
  );

  expect({ status, body }).toEqual({
    status: 402,
    body: { error: { code: "out_of_items", message: "You have 1 item left; this email needs 2." } },
  });
  expect(fakePdfStore.objects.size).toBe(1);
});

const mail = [
  "From: boekhouding@hoekstra.example",
  "Subject: Factuur oktober",
  "Content-Type: text/plain",
  "",
  "Het totaal is 151,25 euro.",
  "",
].join("\r\n");

test("an email file sent as message/rfc822, or as a multipart `.eml`, becomes an email Document", async () => {
  const t = newBackend();
  const { formId, key } = await kantoorNoord(t);
  const form = new FormData();
  form.append("file", new Blob([mail], { type: "application/octet-stream" }), "bericht.eml");

  const raw = await send(t, `/v1/forms/${formId}/documents`, key, mail, { "Content-Type": "message/rfc822" });
  const multipart = await send(t, `/v1/forms/${formId}/documents`, key, form, {});

  expect([raw.status, multipart.status]).toEqual([201, 201]);
  expect(await stored(t)).toMatchObject([
    { kind: "email", filename: "Factuur oktober", formId },
    { kind: "email", filename: "Factuur oktober", formId },
  ]);
});

test("a file sent as message/rfc822 that is a PDF is a mismatch, and text that is no email is unsupported", async () => {
  const t = newBackend();
  const { key } = await kantoorNoord(t);

  const pdfAsMail = await send(t, "/v1/documents", key, await pdf(1), { "Content-Type": "message/rfc822" });
  const notMail = await send(t, "/v1/documents", key, "just a note", { "Content-Type": "message/rfc822" });

  expect(pdfAsMail.status).toBe(415);
  expect(pdfAsMail.body.error.code).toBe("media_type_mismatch");
  // Parsed as an email it has neither text nor attachments.
  expect(notMail.status).toBe(422);
  expect(notMail.body.error.code).toBe("empty_email");
  await nothingCreated(t);
});

test("the OpenAPI document describes both routes, every error code they answer with and the new fields", () => {
  const { paths, components } = openApiDocument;
  expect(Object.keys(paths).filter((p) => p.endsWith("documents"))).toEqual(["/documents", "/forms/{form_id}/documents"]);
  const codes = openApiDocument.paths["/documents"].post!.responses;
  expect(Object.keys(codes)).toEqual(["201", "400", "401", "402", "404", "413", "415", "422", "500"]);
  expect(Object.keys(components.schemas.EmailDocument.properties!)).toEqual([
    "subject",
    "from",
    "date",
    "body",
    "attachments",
    "form_id",
    "filename",
  ]);
  const content = Object.keys(paths["/documents"].post!.requestBody!.content);
  expect(content).toEqual(
    expect.arrayContaining(["multipart/form-data", "application/pdf", "image/jpeg", "image/png", "image/heic", "message/rfc822", "application/json"]),
  );
});
