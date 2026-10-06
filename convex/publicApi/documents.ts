// POST /v1/forms/{form_id}/documents: a program sends a PDF in and it becomes
// a Document of the Form exactly as if it was emailed to the Form's Intake
// Address (acceptPdf in documents.ts). The caller waits for the answer, so a
// refusal is a 4xx here instead of a line in "Recent emails".
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { acceptPdf, NOT_A_PDF, tooManyPages } from "../documents";
import { pdfStore } from "../lib/pdfStore";
import { apiError, apiJson } from "./respond";
import { type ApiRoute, route } from "./router";

// Convex takes request bodies up to 20 MiB; a bigger one never reaches us.
export const MAX_BYTES = 20 * 1024 * 1024;

const DEFAULT_FILENAME = "document.pdf";

/** The Form, if it is the key's Organisation's, and the key's name (the Document's source). */
export const target = internalQuery({
  args: { organisationId: v.id("organisations"), apiKeyId: v.id("apiKeys"), formId: v.string() },
  handler: async (ctx, { organisationId, apiKeyId, formId }) => {
    const id = ctx.db.normalizeId("forms", formId);
    const form = id === null ? null : await ctx.db.get(id);
    const key = await ctx.db.get(apiKeyId);
    return {
      // Another Organisation's Form looks the same as a missing one.
      formId: form !== null && form.organisationId === organisationId ? form._id : null,
      keyName: key?.name ?? null,
    };
  },
});

type Refusal = { status: number; code: string; message: string };

/** The API's answer to one of acceptPdf's refusals, or null for any other error. */
function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ConvexError)) return null;
  const { data } = error;
  if (typeof data === "object" && data !== null && data.code === "out_of_pages") {
    return { status: 402, code: "out_of_pages", message: String(data.message) };
  }
  if (data === NOT_A_PDF) return { status: 415, code: "not_a_pdf", message: data };
  if (typeof data === "string" && data === tooManyPages(Number(data.match(/\d+/)?.[0]))) {
    return { status: 422, code: "too_many_pages", message: data };
  }
  // The Form was deleted after the request came in.
  if (data === "Form not found") return { status: 404, code: "not_found", message: "There's no such Form." };
  return null;
}

/**
 * Runs apart from the HTTP action, so the PDF's bytes there and the parsed PDF
 * here don't share one action's memory.
 */
export const accept = internalAction({
  args: {
    organisationId: v.id("organisations"),
    formId: v.id("forms"),
    apiKeyId: v.id("apiKeys"),
    keyName: v.string(),
    key: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, { apiKeyId, keyName, ...document }) => {
    try {
      const documentId = await acceptPdf(ctx, {
        ...document,
        uploadedBy: `api:${apiKeyId}`,
        // Copied now, so the source still reads right after the key is revoked;
        // "API" reads the same in Dutch and English.
        uploaderEmail: `API: ${keyName}`,
      });
      return { documentId, refusal: null };
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal === null) throw error;
      return { documentId: null, refusal };
    }
  },
});

const encoder = new TextEncoder();

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number) {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * The parts of a multipart/form-data body. Parsed by hand: Convex's runtime
 * promises only text(), json(), blob() and arrayBuffer() on a request.
 */
function multipartParts(body: Uint8Array, boundary: string) {
  const delimiter = encoder.encode(`--${boundary}`);
  const next = encoder.encode(`\r\n--${boundary}`);
  const headerEnd = encoder.encode("\r\n\r\n");
  const parts: Array<{ name: string | null; filename: string | null; body: Uint8Array }> = [];
  let at = indexOf(body, delimiter, 0);
  while (at !== -1) {
    const start = at + delimiter.length;
    // `--boundary--` closes the body.
    if (body[start] === 45 && body[start + 1] === 45) break;
    const headersEnd = indexOf(body, headerEnd, start);
    if (headersEnd === -1) break;
    const end = indexOf(body, next, headersEnd + headerEnd.length);
    if (end === -1) break;
    const disposition =
      new TextDecoder()
        .decode(body.subarray(start, headersEnd))
        .split("\r\n")
        .find((line) => /^content-disposition:/i.test(line)) ?? "";
    const encoded = disposition.match(/\bfilename\*=UTF-8''([^;\s]+)/i)?.[1];
    parts.push({
      name: disposition.match(/\bname="([^"]*)"/i)?.[1] ?? null,
      filename: encoded !== undefined ? safeDecode(encoded) : (disposition.match(/\bfilename="([^"]*)"/i)?.[1] ?? null),
      body: body.subarray(headersEnd + headerEnd.length, end),
    });
    at = end + 2;
  }
  return parts;
}

function safeDecode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The PDF and its filename from the request, or the error to answer with. */
async function pdfOf(request: Request): Promise<{ bytes: Uint8Array; filenames: Array<string | null> } | Response> {
  const type = request.headers.get("Content-Type") ?? "";
  const multipart = /^multipart\/form-data\b/i.test(type);
  if (!multipart && !/^application\/(pdf|octet-stream)\b/i.test(type)) {
    return apiError(
      415,
      "unsupported_media_type",
      "Send the PDF as multipart/form-data with a `file` part, or as the body with Content-Type: application/pdf.",
    );
  }
  const tooLarge = () => apiError(413, "file_too_large", "The PDF is larger than 20 MB.");
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BYTES) return tooLarge();
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return tooLarge();
  const missing = () => apiError(400, "missing_file", "The request has no PDF in it.");
  if (!multipart) return body.length === 0 ? missing() : { bytes: body, filenames: [] };

  const boundary = type.match(/\bboundary=(?:"([^"]+)"|([^;\s]+))/i);
  const parts = boundary === null ? [] : multipartParts(body, boundary[1] ?? boundary[2]);
  const file = parts.find((p) => p.name === "file");
  if (file === undefined || file.body.length === 0) return missing();
  const named = parts.find((p) => p.name === "filename");
  return { bytes: file.body, filenames: [named ? new TextDecoder().decode(named.body) : null, file.filename] };
}

function cleanFilename(...candidates: Array<string | null>) {
  for (const candidate of candidates) {
    // Only the name, without any folders a client put in front.
    const name = candidate?.split(/[\\/]/).pop()?.trim().slice(0, 255);
    if (name) return name;
  }
  return DEFAULT_FILENAME;
}

export const documentsRoutes: ApiRoute[] = [
  route("POST", "/v1/forms/{form_id}/documents", async (ctx, request, { caller, params }) => {
    const { formId, keyName } = await ctx.runQuery(internal.publicApi.documents.target, {
      ...caller,
      formId: params.form_id,
    });
    if (keyName === null) return apiError(401, "invalid_api_key", "This API Key doesn't exist or was revoked.");
    if (formId === null) return apiError(404, "not_found", "There's no such Form.");

    const pdf = await pdfOf(request);
    if (pdf instanceof Response) return pdf;
    const filename = cleanFilename(new URL(request.url).searchParams.get("filename"), ...pdf.filenames);

    const key = `${caller.organisationId}/${crypto.randomUUID()}`;
    await pdfStore.store(ctx, key, pdf.bytes);
    let accepted;
    try {
      accepted = await ctx.runAction(internal.publicApi.documents.accept, {
        organisationId: caller.organisationId,
        formId,
        apiKeyId: caller.apiKeyId,
        keyName,
        key,
        filename,
      });
    } catch (error) {
      // Nothing is left behind when it fails halfway (a refusal removes it already).
      await pdfStore.remove(ctx, key);
      throw error;
    }
    const { documentId, refusal } = accepted;
    if (refusal !== null) return apiError(refusal.status, refusal.code, refusal.message);
    return apiJson({ id: documentId, state: "processing" }, 201);
  }),
];
