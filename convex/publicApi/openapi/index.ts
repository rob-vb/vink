// The /v1 OpenAPI 3.1 submission: the one source for GET /v1/openapi.json, the
// API reference page (/developers/api) and, later, the Power Automate
// connector. A new resource adds its own file here and one entry to `parts`.
import { API_BASE_URL, commonErrors, errorSchema, securitySchemes, sharedResponses } from "./common";
import { submissions } from "./submissions";
import { submissionRead } from "./submissionRead";
import { forms } from "./forms";
import { subscriptions } from "./subscriptions";
import type { OpenApiPart } from "./types";

export const parts: OpenApiPart[] = [forms, submissions, submissionRead, subscriptions];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Vink API",
    version: "1",
    description:
      "Send Submissions in, read them after Approval and subscribe to Approvals. Every request needs an API Key; every answer is JSON with snake_case keys.",
  },
  servers: [{ url: API_BASE_URL }],
  security: [{ apiKey: [] }],
  // Parts may share a tag (Submissions); it is listed once.
  tags: parts.map((part) => part.tag).filter((tag, i, all) => all.findIndex((t) => t.name === tag.name) === i),
  paths: Object.assign({}, ...parts.map((part) => part.paths)) as OpenApiPart["paths"],
  components: {
    securitySchemes,
    schemas: Object.assign({ Error: errorSchema }, ...parts.map((part) => part.schemas)) as OpenApiPart["schemas"],
    responses: sharedResponses,
  },
};

/** Every error code any endpoint answers with, for the reference's table. */
export const errorCodes = [...commonErrors, ...parts.flatMap((part) => part.errors ?? [])];
