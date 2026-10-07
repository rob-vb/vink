// POST /v1/forms/{form_id}/documents (publicApi/documents.ts).
import { PDF_TOO_LARGE } from "../../lib/pdfLimits";
import type { OpenApiPart, Response } from "./types";

const refusal = (description: string, code: string, message: string): Response => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: { code, message } } },
  },
});

export const documents: OpenApiPart = {
  tag: { name: "Documents", description: "PDFs Vink reads into a Form's Fields." },
  paths: {
    "/forms/{form_id}/documents": {
      post: {
        operationId: "sendDocument",
        summary: "Send a Document in",
        description:
          "Sends a PDF to a Form. It becomes a Document exactly as if it was emailed to the Form's Intake Address: the same checks, the same Pages counted once, and it shows in Vink with the API Key's name as its source. Vink then reads it; the Document needs review or is approved later. The PDF must be readable, at most 20 pages and at most 10 MB, and your Organisation must have enough Pages left for it.",
        tags: ["Documents"],
        parameters: [
          {
            name: "form_id",
            in: "path",
            required: true,
            description: "The Form's `id`, from List Forms.",
            schema: { type: "string" },
          },
          {
            name: "filename",
            in: "query",
            description:
              "The name the Document shows in Vink. Defaults to the multipart file's name, else `document.pdf`.",
            schema: { type: "string", example: "F-2026-118.pdf" },
          },
        ],
        requestBody: {
          required: true,
          description:
            "The PDF, at most 10 MB: either `multipart/form-data` with the PDF in a part named `file` (what Zapier, Make and Power Automate send; an optional `filename` part names it), or the PDF itself as the body with `Content-Type: application/pdf` (or `application/octet-stream`).",
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "The PDF." },
                  filename: { type: "string", description: "The name the Document shows in Vink." },
                },
              },
            },
            "application/pdf": { schema: { type: "string", format: "binary" } },
            "application/octet-stream": { schema: { type: "string", format: "binary" } },
          },
        },
        responses: {
          "201": {
            description: "Vink accepted the PDF and is reading it.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SentDocument" },
                example: { id: "j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb", state: "processing" },
              },
            },
          },
          "400": refusal("The request has no PDF in it.", "missing_file", "The request has no PDF in it."),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "402": refusal(
            "Your Organisation has fewer Pages left than the PDF has.",
            "out_of_pages",
            "You have 5 pages left; this PDF has 8.",
          ),
          "404": refusal("No Form with this id in your Organisation.", "not_found", "There's no Form with that id in your Organisation."),
          "413": refusal(PDF_TOO_LARGE, "file_too_large", PDF_TOO_LARGE),
          "415": refusal(
            "The file isn't a PDF Vink can read (`not_a_pdf`), or the body is neither multipart/form-data nor a PDF (`unsupported_media_type`).",
            "not_a_pdf",
            "This file isn't a PDF Vink can read.",
          ),
          "422": refusal(
            "The PDF has more than 20 pages.",
            "too_many_pages",
            "This PDF has 21 pages. Vink reads up to 20 pages per Document.",
          ),
          "500": { $ref: "#/components/responses/InternalError" },
        },
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
          description: "Always `processing` here: Vink is reading the PDF.",
        },
      },
    },
  },
  errors: [
    { status: 400, code: "missing_file", meaning: "No `file` part, or an empty body." },
    { status: 402, code: "out_of_pages", meaning: "Not enough Pages left for this PDF." },
    { status: 413, code: "file_too_large", meaning: PDF_TOO_LARGE },
    { status: 415, code: "not_a_pdf", meaning: "The file isn't a PDF Vink can read." },
    {
      status: 415,
      code: "unsupported_media_type",
      meaning: "The body is neither multipart/form-data nor application/pdf.",
    },
    { status: 422, code: "too_many_pages", meaning: "The PDF has more than 20 pages." },
  ],
};
