// POST /v1/documents and POST /v1/forms/{form_id}/documents: a program sends a
// PDF, a photo (JPG, PNG, HEIC) or an email in and it becomes a Document
// exactly as if it was uploaded in the app (acceptFile and acceptEmail in
// documents.ts). With a Form (the path, or `form_id`) it is that Form's;
// without one the Router picks the Form after Read (ADR 0010). The caller
// waits for the answer, so a refusal is a 4xx here instead of a line in
// "Recent emails".
//
// What a file is comes from its first bytes (lib/sniff.ts), never from its
// Content-Type alone. A Content-Type that names a PDF or an image type and
// contradicts the bytes is refused (415 media_type_mismatch): a client that
// sends PNG bytes as application/pdf has a bug, and an answer says so instead
// of Vink guessing what was meant. A type that names no file type (octet-stream,
// or none) leaves the bytes to decide.
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction, internalQuery } from "../_generated/server";
import { acceptEmail, acceptFile, NOT_A_PDF, tooManyPages } from "../documents";
import { parseEml } from "../lib/emailParse";
import {
  ATTACHMENTS_TOO_LARGE,
  EMAIL_BODY_TOO_LARGE,
  EMPTY_EMAIL,
  FILE_TOO_LARGE,
  IMAGE_TOO_LARGE,
  MAX_PDF_BYTES,
  PDF_TOO_LARGE,
  TOO_MANY_ATTACHMENTS,
  UNSUPPORTED_TYPE,
} from "../lib/inputLimits";
import { pdfStore } from "../lib/pdfStore";
import { contradicts, EXTENSION_OF, normalizeType, sniffFile } from "../lib/sniff";
import { apiError, apiJson } from "./respond";
import { type ApiRoute, route } from "./router";

/**
 * The Form, if it is the key's Organisation's, and the key's name (the
 * Document's source). `formId` is null when none was given, and also when the
 * one given is not the Organisation's: `formGiven` tells them apart.
 */
export const target = internalQuery({
  args: { organisationId: v.id("organisations"), apiKeyId: v.id("apiKeys"), formId: v.optional(v.string()) },
  handler: async (ctx, { organisationId, apiKeyId, formId }) => {
    const id = formId === undefined ? null : ctx.db.normalizeId("forms", formId);
    const form = id === null ? null : await ctx.db.get(id);
    const key = await ctx.db.get(apiKeyId);
    return {
      formGiven: formId !== undefined,
      // Another Organisation's Form looks the same as a missing one.
      formId: form !== null && form.organisationId === organisationId ? form._id : null,
      keyName: key?.name ?? null,
    };
  },
});

type Refusal = { status: number; code: string; message: string };

/** The API's answer to one of acceptFile's and acceptEmail's refusals, or null for any other error. */
function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ConvexError)) return null;
  const { data } = error;
  if (typeof data === "object" && data !== null && data.code === "out_of_items") {
    return { status: 402, code: "out_of_items", message: String(data.message) };
  }
  if (data === NOT_A_PDF) return { status: 415, code: "not_a_pdf", message: data };
  if (data === UNSUPPORTED_TYPE) return { status: 415, code: "unsupported_file_type", message: data };
  if (typeof data === "string" && data === tooManyPages(Number(data.match(/\d+/)?.[0]))) {
    return { status: 422, code: "too_many_pages", message: data };
  }
  if (data === TOO_MANY_ATTACHMENTS) return { status: 422, code: "too_many_attachments", message: data };
  if (data === EMPTY_EMAIL) return { status: 422, code: "empty_email", message: data };
  if (
    data === PDF_TOO_LARGE ||
    data === IMAGE_TOO_LARGE ||
    data === EMAIL_BODY_TOO_LARGE ||
    data === ATTACHMENTS_TOO_LARGE
  ) {
    return { status: 413, code: "file_too_large", message: data };
  }
  // The Form was deleted after the request came in.
  if (data === "Form not found") return { status: 404, code: "not_found", message: "There's no Form with that id in your Organisation." };
  return null;
}

/**
 * Runs apart from the HTTP action, so the file's bytes there and the parsed
 * PDF here don't share one action's memory.
 */
export const accept = internalAction({
  args: {
    organisationId: v.id("organisations"),
    formId: v.optional(v.id("forms")),
    apiKeyId: v.id("apiKeys"),
    keyName: v.string(),
    key: v.string(),
    filename: v.string(),
  },
  handler: async (ctx, { apiKeyId, keyName, ...document }) => {
    try {
      const documentId = await acceptFile(ctx, {
        ...document,
        ...sourceOf(apiKeyId, keyName),
      });
      return { documentId, refusal: null };
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal === null) throw error;
      return { documentId: null, refusal };
    }
  },
});

/** Who a Document came from. Copied now, so the source still reads right after the key is revoked; "API" reads the same in Dutch and English. */
function sourceOf(apiKeyId: Id<"apiKeys">, keyName: string) {
  return { uploadedBy: `api:${apiKeyId}`, uploaderEmail: `API: ${keyName}` };
}

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
  const parts: Array<{ name: string | null; filename: string | null; type: string | null; body: Uint8Array }> = [];
  let at = indexOf(body, delimiter, 0);
  while (at !== -1) {
    const start = at + delimiter.length;
    // `--boundary--` closes the body.
    if (body[start] === 45 && body[start + 1] === 45) break;
    const headersEnd = indexOf(body, headerEnd, start);
    if (headersEnd === -1) break;
    const end = indexOf(body, next, headersEnd + headerEnd.length);
    if (end === -1) break;
    const headerLines = new TextDecoder().decode(body.subarray(start, headersEnd)).split("\r\n");
    const disposition = headerLines.find((line) => /^content-disposition:/i.test(line)) ?? "";
    const encoded = disposition.match(/\bfilename\*=UTF-8''([^;\s]+)/i)?.[1];
    parts.push({
      name: disposition.match(/\bname="([^"]*)"/i)?.[1] ?? null,
      type: headerLines.find((line) => /^content-type:/i.test(line))?.replace(/^content-type:\s*/i, "") ?? null,
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

/** What a request sent in, before anyone has looked at the bytes. */
type RequestInput =
  | {
      kind: "file";
      bytes: Uint8Array;
      /** The Content-Type that came with the file (of the request, or of the multipart part), or null. */
      declared: string | null;
      /** Candidate names for the Document, best first. */
      filenames: Array<string | null>;
      formId: string | null;
    }
  | {
      kind: "email";
      email: {
        subject: string;
        from: string;
        date: string;
        body: string;
        attachments: Array<{ filename: string; bytes: Uint8Array }>;
      };
      filenames: Array<string | null>;
      formId: string | null;
    };

const FILE_TYPES = /^(application\/(pdf|octet-stream)|image\/(jpe?g|pjpeg|png|heic|heif)|message\/rfc822)\b/i;

const isEml = (type: string | null, filename: string | null) =>
  (type !== null && normalizeType(type) === "message/rfc822") || (filename?.toLowerCase().endsWith(".eml") ?? false);

/** A string property of the JSON body, undefined when absent or null; a wrong type is the caller's 400. */
function text(json: Record<string, unknown>, name: string): string | undefined | Response {
  const value = json[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return apiError(400, "invalid_request", `\`${name}\` must be a string.`);
  return value;
}

/** The email in a JSON body: `{ subject, from, date, body, attachments: [{ filename, content_base64 }] }`. */
function emailFromJson(json: unknown): RequestInput | Response {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return apiError(400, "invalid_request", "The body must be a JSON object.");
  }
  const object = json as Record<string, unknown>;
  const fields: Record<string, string | undefined> = {};
  for (const name of ["subject", "from", "date", "body", "form_id", "filename"]) {
    const value = text(object, name);
    if (value instanceof Response) return value;
    fields[name] = value;
  }
  const given = object.attachments ?? [];
  if (!Array.isArray(given)) return apiError(400, "invalid_request", "`attachments` must be a list.");
  // More than the limit is the Document's refusal (too_many_attachments), but not before they are decoded.
  const attachments: Array<{ filename: string; bytes: Uint8Array }> = [];
  for (const [index, attachment] of given.entries()) {
    const a = attachment as Record<string, unknown> | null;
    if (typeof a !== "object" || a === null || typeof a.content_base64 !== "string") {
      return apiError(400, "invalid_request", `Attachment ${index + 1} needs a \`content_base64\` string.`);
    }
    if (a.filename !== undefined && typeof a.filename !== "string") {
      return apiError(400, "invalid_request", `Attachment ${index + 1}: \`filename\` must be a string.`);
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(a.content_base64), (c) => c.charCodeAt(0));
    } catch {
      return apiError(400, "invalid_request", `Attachment ${index + 1}: \`content_base64\` isn't valid base64.`);
    }
    attachments.push({ filename: cleanFilename((a.filename as string | undefined) ?? null) || `attachment-${index + 1}`, bytes });
  }
  const date = new Date(fields.date ?? "");
  return {
    kind: "email",
    email: {
      subject: (fields.subject ?? "").trim(),
      from: (fields.from ?? "").trim(),
      // A date the sender wrote in any readable form; anything else is left out.
      date: fields.date === undefined || Number.isNaN(date.getTime()) ? "" : date.toISOString(),
      body: fields.body ?? "",
      attachments,
    },
    filenames: [fields.filename ?? null],
    formId: fields.form_id || null,
  };
}

/** The file or email in the request, or the error to answer with. */
async function inputOf(request: Request): Promise<RequestInput | Response> {
  const type = request.headers.get("Content-Type") ?? "";
  const multipart = /^multipart\/form-data\b/i.test(type);
  const json = /^application\/json\b/i.test(type);
  if (!multipart && !json && !FILE_TYPES.test(type)) {
    return apiError(
      415,
      "unsupported_media_type",
      "Send the file as multipart/form-data with a `file` part, as the body with the file's own Content-Type (application/pdf, image/jpeg, image/png, image/heic or message/rfc822), or an email as application/json.",
    );
  }
  // The whole body, so a multipart file's own bytes (or an email's base64 attachments) are within the limit too.
  const tooLarge = () => apiError(413, "file_too_large", FILE_TOO_LARGE);
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_PDF_BYTES) return tooLarge();
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_PDF_BYTES) return tooLarge();
  const missing = () => apiError(400, "missing_file", "The request has no file in it.");
  if (body.length === 0) return missing();

  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return apiError(400, "invalid_request", "The body isn't valid JSON.");
    }
    return emailFromJson(parsed);
  }
  if (!multipart) {
    return { kind: "file", bytes: body, declared: normalizeType(type) === "application/octet-stream" ? null : type, filenames: [], formId: null };
  }

  const boundary = type.match(/\bboundary=(?:"([^"]+)"|([^;\s]+))/i);
  const parts = boundary === null ? [] : multipartParts(body, boundary[1] ?? boundary[2]);
  const file = parts.find((p) => p.name === "file");
  if (file === undefined || file.body.length === 0) return missing();
  const textOf = (name: string) => {
    const part = parts.find((p) => p.name === name);
    // Zapier sends an input that was left empty as "": that is not given.
    return part ? new TextDecoder().decode(part.body).trim() || null : null;
  };
  return {
    kind: "file",
    bytes: file.body,
    declared: file.type === null || normalizeType(file.type) === "application/octet-stream" ? null : file.type,
    filenames: [textOf("filename"), file.filename],
    formId: textOf("form_id"),
  };
}

function cleanFilename(...candidates: Array<string | null>) {
  for (const candidate of candidates) {
    // Only the name, without any folders a client put in front.
    const name = candidate?.split(/[\\/]/).pop()?.trim().slice(0, 255);
    if (name) return name;
  }
  return "";
}

type EmailInput = Extract<RequestInput, { kind: "email" }>;

/** Reads an email file (message/rfc822) into the email a RequestInput holds. */
function emailFromEml(bytes: Uint8Array, filenames: Array<string | null>, formId: string | null): EmailInput {
  const { subject, from, date, body, attachments } = parseEml(bytes);
  return { kind: "email", email: { subject, from, date, body, attachments }, filenames, formId };
}

type Caller = { organisationId: Id<"organisations">; apiKeyId: Id<"apiKeys"> };

const created = (documentId: string) => apiJson({ id: documentId, state: "processing" }, 201);

/** A PDF or an image, by its bytes: stored with its real type, then accepted like an upload. */
async function sendFile(
  ctx: ActionCtx,
  caller: Caller,
  { bytes, mimeType, formId, keyName, filename }: {
    bytes: Uint8Array;
    mimeType: string;
    formId: Id<"forms"> | null;
    keyName: string;
    filename: string;
  },
) {
  const key = `${caller.organisationId}/${crypto.randomUUID()}`;
  await pdfStore.store(ctx, key, bytes, mimeType);
  let accepted;
  try {
    accepted = await ctx.runAction(internal.publicApi.documents.accept, {
      organisationId: caller.organisationId,
      ...(formId === null ? {} : { formId }),
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
  return created(documentId);
}

async function sendEmail(
  ctx: ActionCtx,
  caller: Caller,
  { input, formId, keyName, queryName }: { input: EmailInput; formId: Id<"forms"> | null; keyName: string; queryName: string | null },
) {
  try {
    const documentId = await acceptEmail(ctx, {
      organisationId: caller.organisationId,
      ...(formId === null ? {} : { formId }),
      ...sourceOf(caller.apiKeyId, keyName),
      email: input.email,
      // The subject names the Document unless the sender named it (an email file's own name does not).
      filename: cleanFilename(queryName, ...input.filenames.filter((n) => !n?.toLowerCase().endsWith(".eml"))) || undefined,
    });
    return created(documentId);
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === null) throw error;
    return apiError(refusal.status, refusal.code, refusal.message);
  }
}

async function send(ctx: ActionCtx, request: Request, caller: Caller, pathFormId: string | undefined) {
  const input = await inputOf(request);
  if (input instanceof Response) return input;
  const queryName = new URL(request.url).searchParams.get("filename");
  // A Form in the path is the Form; otherwise the one named in the request, if any.
  const requestedForm = pathFormId ?? (input.formId || new URL(request.url).searchParams.get("form_id")) ?? undefined;

  const { formId, formGiven, keyName } = await ctx.runQuery(internal.publicApi.documents.target, {
    ...caller,
    formId: requestedForm || undefined,
  });
  if (keyName === null) return apiError(401, "invalid_api_key", "This API Key doesn't exist or was revoked.");
  if (formGiven && formId === null) return apiError(404, "not_found", "There's no Form with that id in your Organisation.");

  if (input.kind === "email") return await sendEmail(ctx, caller, { input, formId, keyName, queryName });

  const sniffed = sniffFile(input.bytes);
  const named = cleanFilename(queryName, ...input.filenames);
  if (sniffed === null) {
    if (isEml(input.declared, named)) {
      return await sendEmail(ctx, caller, {
        input: emailFromEml(input.bytes, input.filenames, input.formId),
        formId,
        keyName,
        queryName,
      });
    }
    // Said to be a PDF, and the bytes are nothing that Vink reads.
    if (input.declared !== null && normalizeType(input.declared) === "application/pdf") {
      return apiError(415, "not_a_pdf", NOT_A_PDF);
    }
    return apiError(415, "unsupported_file_type", UNSUPPORTED_TYPE);
  }
  if (contradicts(input.declared, sniffed) || (input.declared !== null && normalizeType(input.declared) === "message/rfc822")) {
    return apiError(
      415,
      "media_type_mismatch",
      `The Content-Type is ${normalizeType(input.declared!)}, but the file is ${sniffed.mimeType}. Send it with its own Content-Type, or as application/octet-stream.`,
    );
  }
  return await sendFile(ctx, caller, {
    bytes: input.bytes,
    mimeType: sniffed.mimeType,
    formId,
    keyName,
    filename: named || `document.${EXTENSION_OF[sniffed.mimeType]}`,
  });
}

export const documentsRoutes: ApiRoute[] = [
  // The Router picks the Form, unless `form_id` names one.
  route("POST", "/v1/documents", (ctx, request, { caller }) => send(ctx, request, caller, undefined)),
  route("POST", "/v1/forms/{form_id}/documents", (ctx, request, { caller, params }) =>
    send(ctx, request, caller, params.form_id),
  ),
];
