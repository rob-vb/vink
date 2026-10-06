// POST /v1/subscriptions, DELETE /v1/subscriptions/{id},
// GET /v1/forms/{form_id}/sample and /schema (publicApi/subscriptions.ts).
import type { OpenApiPart, Response } from "./types";

const exampleSubscription = {
  id: "j57a2x9kq4m1c8v3n6e5w4t8hs7bm2rb",
  form_id: "k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra",
  url: "https://hooks.zapier.com/hooks/standard/123456/abcdef/",
  created_at: "2026-10-06T09:00:00.000Z",
};

const exampleEnvelope = {
  event: "document.approved",
  delivery_id: "test_3f2a7c1e-9b4d-4e8a-a1f0-6c5d2b7e9a10",
  test: true,
  document: { id: "test", filename: "example.pdf", uploaded_at: "2026-10-06T09:00:00.000Z" },
  form: { id: "k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra", version: 3 },
  approval: { mode: "manual", by: null, at: "2026-10-06T09:00:00.000Z" },
  data: {
    license_plate: "Example Kenteken",
    kind: "repair",
    lines: [{ description: "Example Omschrijving", quantity: 123.45 }],
  },
};

const notFound = (what: string): Response => ({
  description: `No ${what} with that id in your Organisation.`,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { error: { code: "not_found", message: `There's no ${what} with that id in your Organisation.` } },
    },
  },
});

const json = (description: string, schema: string, example: unknown): Response => ({
  description,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` }, example } },
});

export const subscriptions: OpenApiPart = {
  tag: {
    name: "Subscriptions",
    description:
      "For automation platforms (Zapier, Make, Power Automate): hear about a Form's Approvals. A Subscription is a Webhook in Vink, so Admins see it under Integrations.",
  },
  paths: {
    "/subscriptions": {
      post: {
        operationId: "createSubscription",
        summary: "Subscribe to Approvals",
        description:
          "From now on, every Approval of a Document of this Form is POSTed to `url` as an envelope, the same one every Webhook gets: with retries, a log in Vink and the `X-Vink-Signature` header. Vink makes a Webhook for it, named after the API Key and attached to the Form, so the Form's Field keys are locked while the Subscription is active. It ends when you unsubscribe, when the API Key is revoked or when an Admin deletes that Webhook.",
        tags: ["Subscriptions"],
        requestBody: {
          required: true,
          description:
            "JSON with `form_id`, the Form to hear about (from List Forms), and `url`, the https URL that receives the envelopes.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SubscriptionRequest" },
              example: { form_id: exampleSubscription.form_id, url: exampleSubscription.url },
            },
          },
        },
        responses: {
          "201": {
            ...json("The Subscription.", "Subscription", exampleSubscription),
            headers: {
              Location: {
                description: "The Subscription's URL: a `DELETE` on it unsubscribes (Power Automate does that itself).",
                schema: { type: "string", example: `https://vink.page/v1/subscriptions/${exampleSubscription.id}` },
              },
            },
          },
          "400": {
            description: "The body isn't JSON with `form_id` and `url`.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": notFound("Form"),
          "409": {
            description: "The Organisation already has 50 Subscriptions.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "422": {
            description: "`url` isn't an https URL.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/subscriptions/{id}": {
      delete: {
        operationId: "deleteSubscription",
        summary: "Unsubscribe",
        description:
          "Ends the Subscription and removes its Webhook. Any API Key of the Organisation can end it. Approvals that are still being sent to it are given up. Idempotent: a Subscription that has ended already (an Admin deleted its Webhook, or its `url` answered `410`), or an id Vink doesn't know, gets the same answer and nothing changes.",
        tags: ["Subscriptions"],
        parameters: [
          { name: "id", in: "path", required: true, description: "The Subscription's id.", schema: { type: "string" } },
        ],
        responses: {
          "200": json("The Subscription ended, or had ended already.", "DeletedSubscription", {
            id: exampleSubscription.id,
            deleted: true,
          }),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/forms/{form_id}/sample": {
      get: {
        operationId: "getFormSample",
        summary: "Sample envelope",
        description:
          "An example of the envelope a Subscription receives for this Form, with example values for the Fields of its current version: what a test-send sends. Lists are arrays with one entry. Automation platforms use it to show the fields before the first real Approval.",
        tags: ["Subscriptions"],
        parameters: [
          {
            name: "form_id",
            in: "path",
            required: true,
            description: "The Form's id, from List Forms.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": json("The example envelope, with `\"test\": true`.", "Envelope", exampleEnvelope),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": notFound("Form"),
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/forms/{form_id}/schema": {
      get: {
        operationId: "getFormSchema",
        summary: "Envelope schema",
        description:
          "The JSON Schema of the envelope a Subscription receives for this Form, with one property per Field of its current version under `data`. Power Automate uses it to show your Fields as dynamic content.",
        tags: ["Subscriptions"],
        parameters: [
          {
            name: "form_id",
            in: "path",
            required: true,
            description: "The Form's id, from List Forms.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": json("The schema.", "EnvelopeSchema", {
            schema: {
              type: "object",
              properties: {
                event: { type: "string", "x-ms-summary": "Event" },
                data: {
                  type: "object",
                  "x-ms-summary": "Data",
                  properties: {
                    license_plate: { type: "string", title: "Kenteken", "x-ms-summary": "Kenteken", "x-nullable": true },
                  },
                },
              },
            },
          }),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": notFound("Form"),
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  schemas: {
    EnvelopeSchema: {
      type: "object",
      required: ["schema"],
      properties: {
        schema: {
          type: "object",
          description:
            "A JSON Schema of the envelope, in Swagger 2.0 style: one `type` per property, `x-nullable: true` where the value can be `null`, and each Field's label as `title` and `x-ms-summary`.",
        },
      },
    },
    SubscriptionRequest: {
      type: "object",
      required: ["form_id", "url"],
      properties: {
        form_id: { type: "string", description: "The Form whose Approvals you want." },
        url: { type: "string", description: "Receives the envelopes. https only." },
      },
    },
    Subscription: {
      type: "object",
      required: ["id", "form_id", "url", "created_at"],
      properties: {
        id: { type: "string", description: "Use it to unsubscribe." },
        form_id: { type: "string" },
        url: { type: "string" },
        created_at: { type: "string", format: "date-time" },
      },
    },
    DeletedSubscription: {
      type: "object",
      required: ["id", "deleted"],
      properties: { id: { type: "string" }, deleted: { type: "boolean", description: "Always `true`." } },
    },
    Envelope: {
      type: "object",
      required: ["event", "delivery_id", "test", "document", "form", "approval", "data"],
      description: "What every Webhook receives on an Approval, signed with `X-Vink-Signature`.",
      properties: {
        event: { type: "string", enum: ["document.approved"] },
        delivery_id: {
          type: "string",
          description: "The same on every retry and re-send of one Delivery: de-duplicate on it. `test_…` in a test; `doc_<document id>` when read with Get a Document.",
        },
        test: { type: "boolean", description: "`true` for a test-send or a sample." },
        document: {
          type: "object",
          required: ["id", "filename", "uploaded_at"],
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            uploaded_at: { type: "string", format: "date-time" },
          },
        },
        form: {
          type: "object",
          required: ["id", "version"],
          properties: {
            id: { type: "string" },
            version: { type: "integer", description: "The Form Version the Document was read with." },
          },
        },
        approval: {
          type: "object",
          required: ["mode", "by", "at"],
          properties: {
            mode: { type: "string", enum: ["manual", "auto"], description: "`auto` for Auto-Send." },
            by: { type: ["string", "null"], description: "The approving user's id; `null` for Auto-Send." },
            at: { type: "string", format: "date-time" },
          },
        },
        data: {
          type: "object",
          description:
            "One key per Field of the Form, always present: `null` for no value. A List Field is an array of entries, each with every sub-Field key; `[]` for none.",
        },
      },
    },
  },
  errors: [
    { status: 400, code: "invalid_request", meaning: "The body isn't the JSON the endpoint takes." },
    { status: 409, code: "too_many_subscriptions", meaning: "The Organisation already has 50 Subscriptions." },
    { status: 422, code: "invalid_url", meaning: "A Subscription's `url` must be an https URL." },
  ],
};
