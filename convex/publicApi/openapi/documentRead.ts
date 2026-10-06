// GET /v1/documents/{id} (publicApi/documentRead.ts). The Payload is the
// `Envelope` schema of openapi/subscriptions.ts: the one every Webhook gets.
import type { OpenApiPart } from "./types";

const exampleDocument = {
  id: "j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb",
  form_id: "k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra",
  state: "approved",
  filename: "werkbon-1042.pdf",
  uploaded_at: "2026-10-06T09:00:00.000Z",
  data_deleted_at: null,
  payload: {
    event: "document.approved",
    delivery_id: "doc_j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb",
    test: false,
    document: {
      id: "j57b2x0sd4kq9r1m8n3c6v7w5h7bm2rb",
      filename: "werkbon-1042.pdf",
      uploaded_at: "2026-10-06T09:00:00.000Z",
    },
    form: { id: "k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra", version: 3 },
    approval: { mode: "manual", by: "user_2x9KqL", at: "2026-10-06T09:12:00.000Z" },
    data: {
      license_plate: "OR-18-DH",
      kind: "repair",
      lines: [{ description: "Remblokken voor", quantity: 2 }],
    },
  },
};

export const documentRead: OpenApiPart = {
  tag: { name: "Documents", description: "PDFs Vink reads into a Form's Fields." },
  paths: {
    "/documents/{id}": {
      get: {
        operationId: "getDocument",
        summary: "Get a Document",
        description:
          "The Document's state and, once it is approved, its Payload: the same envelope every Webhook gets. Before Approval `payload` is `null` and nothing of the Document's values is in the answer, so nothing leaves Vink unapproved. After its data is deleted (Retention, or an Admin's delete now) `payload` is `null` again and `data_deleted_at` says when.",
        tags: ["Documents"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "The Document's id, from Send in a Document or an envelope's `document.id`.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "The Document.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Document" }, example: exampleDocument },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": {
            description: "No Document with that id in your Organisation.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: { code: "not_found", message: "There's no Document with that id in your Organisation." },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  schemas: {
    Document: {
      type: "object",
      required: ["id", "form_id", "state", "filename", "uploaded_at", "data_deleted_at", "payload"],
      properties: {
        id: { type: "string" },
        form_id: { type: "string", description: "The Form it is read with." },
        state: {
          type: "string",
          enum: ["processing", "needs_review", "approved", "rejected", "failed", "deleted"],
          description:
            "`processing`: being read. `needs_review`: waits for a user to check it. `approved`: approved; the Payload is here until its data is deleted. `rejected`: a user ruled it unusable. `failed`: Vink couldn't read it. `deleted`: its data was deleted before Approval. Only `approved` ever has a Payload.",
        },
        filename: { type: "string" },
        uploaded_at: { type: "string", format: "date-time" },
        data_deleted_at: {
          type: ["string", "null"],
          format: "date-time",
          description: "When its PDF and values were deleted; `null` while they are kept.",
        },
        payload: {
          oneOf: [{ $ref: "#/components/schemas/Envelope" }, { type: "null" }],
          description:
            "The envelope a Webhook gets, with `delivery_id` `doc_<id>`. `null` before Approval and after the data is deleted.",
        },
      },
    },
  },
};
