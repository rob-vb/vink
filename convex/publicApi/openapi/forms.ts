// GET /v1/forms (publicApi/forms.ts).
import type { OpenApiPart, Schema } from "./types";

const fieldType = (types: string[]): Schema => ({
  type: "string",
  enum: types,
  description: types.includes("list")
    ? "`choice` has `options`; `list` has `fields`, the sub-Fields of each entry."
    : "`choice` has `options`.",
});

const fieldProperties = (types: string[]): Record<string, Schema> => ({
  key: { type: "string", description: "The Field's name in the Payload, snake_case.", example: "license_plate" },
  label: { type: "string", description: "What users see in Vink.", example: "Kenteken" },
  type: fieldType(types),
  required: { type: "boolean" },
  options: {
    type: "array",
    items: { type: "string" },
    description: "Only on `choice`: the values the Payload can hold.",
  },
});

const exampleForm = {
  id: "k17c9z1fx3q8d2v0n6e5w4t8hs7bm2ra",
  name: "Work order",
  description: "Garage work orders",
  version: 3,
  fields: [
    { key: "license_plate", label: "Kenteken", type: "text", required: true },
    { key: "kind", label: "Soort", type: "choice", required: false, options: ["repair", "service"] },
    {
      key: "lines",
      label: "Regels",
      type: "list",
      required: false,
      fields: [
        { key: "description", label: "Omschrijving", type: "text", required: true },
        { key: "quantity", label: "Aantal", type: "number", required: false },
      ],
    },
  ],
};

export const forms: OpenApiPart = {
  tag: { name: "Forms", description: "The kinds of document your Organisation reads, and their Fields." },
  paths: {
    "/forms": {
      get: {
        operationId: "listForms",
        summary: "List Forms",
        description:
          "Every Form of the key's Organisation, with the Fields of its current version. Automation platforms use it to show your Fields as dynamic fields.",
        tags: ["Forms"],
        responses: {
          "200": {
            description: "The Forms.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: { data: { type: "array", items: { $ref: "#/components/schemas/Form" } } },
                },
                example: { data: [exampleForm] },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  schemas: {
    Form: {
      type: "object",
      required: ["id", "name", "description", "version", "fields"],
      properties: {
        id: { type: "string", description: "Use it in the Form's other endpoints." },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        version: { type: "integer", description: "Goes up by one every time the Form is saved." },
        fields: { type: "array", items: { $ref: "#/components/schemas/Field" } },
      },
    },
    Field: {
      type: "object",
      required: ["key", "label", "type", "required"],
      properties: {
        ...fieldProperties(["text", "number", "date", "boolean", "choice", "list"]),
        fields: {
          type: "array",
          items: { $ref: "#/components/schemas/SubField" },
          description: "Only on `list`: the sub-Fields of each entry.",
        },
      },
    },
    SubField: {
      type: "object",
      required: ["key", "label", "type", "required"],
      properties: fieldProperties(["text", "number", "date", "boolean", "choice"]),
    },
  },
};
