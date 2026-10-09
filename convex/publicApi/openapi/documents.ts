// POST /v1/documents and POST /v1/forms/{form_id}/documents (publicApi/documents.ts).
import { FILE_TOO_LARGE, MAX_EMAIL_ATTACHMENTS } from "../../lib/inputLimits";
import type { MediaType, OpenApiPart, Operation, Response } from "./types";

const refusal = (description: string, code: string, message: string): Response => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: { code, message } } },
  },
});

const binary: MediaType = { schema: { type: "string", format: "binary" } };

// What a request body may be. The raw types are the file itself; `multipart/form-data`
// is what Zapier, Make and Power Automate send; `application/json` is an email.
const fileBodies: Record<string, MediaType> = {
  "multipart/form-data": {
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "The file: a PDF, a JPG, PNG or HEIC image, or an email file (`.eml`).",
        },
        filename: { type: "string", description: "The name the Document shows in Vink." },
        form_id: {
          type: "string",
          description: "The Form's `id`. Left out or empty, Vink picks the Form. Not used on the Form's own path.",
        },
      },
    },
  },
  "application/pdf": binary,
  "image/jpeg": binary,
  "image/png": binary,
  "image/heic": binary,
  "message/rfc822": binary,
  "application/octet-stream": binary,
};

const emailBody: MediaType = {
  schema: { $ref: "#/components/schemas/EmailDocument" },
  example: {
    subject: "Factuur F2026-0412",
    from: "boekhouding@hoekstra.example",
    body: "Goedemiddag, bijgevoegd de factuur van oktober. Het totaal is 151,25 euro.",
    attachments: [{ filename: "factuur.jpg", content_base64: "/9j/4AAQSkZJRgABAQ..." }],
  },
};

const requestDescription = (formInPath: boolean) =>
  `The file or the email, with a request body of at most 10 MB in total. A file is a PDF, a JPG, PNG or HEIC image, or an email file (\`message/rfc822\`, \`.eml\`): send it as \`multipart/form-data\` with the file in a part named \`file\` (an optional \`filename\` part names it${formInPath ? "" : ", an optional `form_id` part picks the Form"}), or as the body itself. Vink decides what the file is from its first bytes. A \`Content-Type\` of \`application/pdf\`, \`image/jpeg\`, \`image/png\`, \`image/heic\` or \`message/rfc822\` that contradicts the bytes is refused (\`media_type_mismatch\`); \`application/octet-stream\` or a part without a type leaves it to the bytes. An email can also be sent as \`application/json\` (see EmailDocument): its text and up to ${MAX_EMAIL_ATTACHMENTS} PDF or image attachments, base64-encoded.`;

const responses = (formInPath: boolean): Operation["responses"] => ({
  "201": {
    description: "Vink accepted the file or email and is reading it.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SentDocument" },
        example: { id: "j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb", state: "processing" },
      },
    },
  },
  "400": refusal(
    "The request has no file in it (`missing_file`), or an email body isn't valid (`invalid_request`).",
    "missing_file",
    "The request has no file in it.",
  ),
  "401": { $ref: "#/components/responses/Unauthorized" },
  "402": refusal(
    "Your Organisation has fewer Items left than the input needs.",
    "out_of_items",
    "You have 5 items left; this PDF needs 8.",
  ),
  "404": refusal(
    formInPath ? "No Form with this id in your Organisation." : "A `form_id` was given, and no Form in your Organisation has it.",
    "not_found",
    "There's no Form with that id in your Organisation.",
  ),
  "413": refusal(
    "The request body, an image or an email's text or attachments are over their limit.",
    "file_too_large",
    FILE_TOO_LARGE,
  ),
  "415": refusal(
    "Vink can't read the file. `unsupported_file_type`: its first bytes are not a PDF, JPG, PNG or HEIC image (or an email file sent as one). `not_a_pdf`: it is sent as a PDF and isn't a PDF Vink can read. `media_type_mismatch`: the `Content-Type` names another file type than the bytes. `unsupported_media_type`: the body is none of the content types above.",
    "unsupported_file_type",
    "Vink reads PDFs, photos (JPG, PNG, HEIC) and the email text; this file type isn't supported.",
  ),
  "422": refusal(
    "The PDF has more than 20 pages (`too_many_pages`), an email has more than 10 attachments (`too_many_attachments`) or no text and no attachments (`empty_email`).",
    "too_many_pages",
    "This PDF has 21 pages. Vink reads up to 20 pages per Document.",
  ),
  "500": { $ref: "#/components/responses/InternalError" },
});

const filenameParameter = {
  name: "filename",
  in: "query",
  description:
    "The name the Document shows in Vink. Defaults to the multipart file's name, else `document.pdf` (`.jpg`, `.png`, `.heic`) by what the file is, else an email's subject.",
  schema: { type: "string", example: "F-2026-118.pdf" },
} as const;

export const documents: OpenApiPart = {
  tag: { name: "Documents", description: "PDFs, photos and emails Vink reads into a Form's Fields." },
  paths: {
    "/documents": {
      post: {
        operationId: "sendDocumentToAnyForm",
        summary: "Send a Document in, without choosing the Form",
        description:
          "Sends a PDF, a photo (JPG, PNG, HEIC) or an email in, exactly as if it was uploaded in the app: the same checks, the same Items counted once, and it shows in Vink with the API Key's name as its source. Without `form_id`, Vink reads it and picks the Form from your Organisation's Forms; a Document that fits none waits under No Form (`state: no_form` in Get a Document). With `form_id`, it is read with that Form, as on Send a Document in. A PDF is at most 20 pages and 10 MB, an image 10 MB, an email's text 200 KB with at most 10 attachments of 12 MB together. Your Organisation must have enough Items left: a PDF costs its pages, a photo 1, an email its text (1, when it has any) plus each attachment.",
        tags: ["Documents"],
        parameters: [
          {
            name: "form_id",
            in: "query",
            description: "The Form's `id`, from List Forms. Left out, Vink picks the Form. It can also be a `form_id` part of a multipart body or a `form_id` property of an email's JSON.",
            schema: { type: "string" },
          },
          filenameParameter,
        ],
        requestBody: {
          required: true,
          description: requestDescription(false),
          content: { ...fileBodies, "application/json": emailBody },
        },
        responses: responses(false),
      },
    },
    "/forms/{form_id}/documents": {
      post: {
        operationId: "sendDocument",
        summary: "Send a Document in",
        description:
          "Sends a PDF, a photo (JPG, PNG, HEIC) or an email to a Form. It becomes a Document exactly as if it was uploaded in the app: the same checks, the same Items counted once, and it shows in Vink with the API Key's name as its source. Vink then reads it; the Document needs review or is approved later. A PDF is at most 20 pages and 10 MB, an image 10 MB, an email's text 200 KB with at most 10 attachments of 12 MB together. Your Organisation must have enough Items left: a PDF costs its pages, a photo 1, an email its text (1, when it has any) plus each attachment. To let Vink pick the Form, use Send a Document in, without choosing the Form.",
        tags: ["Documents"],
        parameters: [
          {
            name: "form_id",
            in: "path",
            required: true,
            description: "The Form's `id`, from List Forms.",
            schema: { type: "string" },
          },
          filenameParameter,
        ],
        requestBody: {
          required: true,
          description: requestDescription(true),
          content: { ...fileBodies, "application/json": emailBody },
        },
        responses: responses(true),
      },
    },
  },
  schemas: {
    SentDocument: {
      type: "object",
      required: ["id", "state"],
      properties: {
        id: { type: "string", description: "The Document's id." },
        state: {
          type: "string",
          enum: ["processing"],
          description: "Always `processing` here: Vink is reading the file or email.",
        },
      },
    },
    EmailDocument: {
      type: "object",
      description:
        "An email as JSON. At least one of `body` and `attachments` is needed. Vink reads it as one Document: its text, then its attachments.",
      properties: {
        subject: { type: "string", description: "The subject. It names the Document in Vink." },
        from: { type: "string", description: "The sender, for example `Name <name@example.com>`." },
        date: { type: "string", format: "date-time", description: "When the email was sent." },
        body: { type: "string", description: "The email's text, at most 200 KB." },
        attachments: {
          type: "array",
          description: "PDF, JPG, PNG or HEIC files, at most 10 and 12 MB together before base64. Any other type is refused.",
          items: {
            type: "object",
            required: ["content_base64"],
            properties: {
              filename: { type: "string" },
              content_base64: { type: "string", description: "The file, base64-encoded (not a data URL)." },
            },
          },
        },
        form_id: {
          type: ["string", "null"],
          description: "The Form's `id`. Left out or `null`, Vink picks the Form. Not used on the Form's own path.",
        },
        filename: { type: "string", description: "The name the Document shows in Vink, instead of the subject." },
      },
    },
  },
  errors: [
    { status: 400, code: "missing_file", meaning: "No `file` part, or an empty body." },
    { status: 400, code: "invalid_request", meaning: "An email's JSON is invalid: not JSON, a wrong type, or an attachment that isn't base64." },
    { status: 402, code: "out_of_items", meaning: "Not enough Items left for this input." },
    { status: 413, code: "file_too_large", meaning: FILE_TOO_LARGE },
    { status: 415, code: "unsupported_file_type", meaning: "The file's first bytes are not a PDF, JPG, PNG or HEIC image." },
    { status: 415, code: "not_a_pdf", meaning: "The file is sent as a PDF and isn't a PDF Vink can read." },
    { status: 415, code: "media_type_mismatch", meaning: "The `Content-Type` names another file type than the file is." },
    {
      status: 415,
      code: "unsupported_media_type",
      meaning: "The body is none of multipart/form-data, application/json, a file type (application/pdf, image/jpeg, image/png, image/heic, message/rfc822) or application/octet-stream.",
    },
    { status: 422, code: "too_many_pages", meaning: "The PDF has more than 20 pages." },
    { status: 422, code: "too_many_attachments", meaning: "The email has more than 10 attachments." },
    { status: 422, code: "empty_email", meaning: "The email has no text and no attachments." },
  ],
};
