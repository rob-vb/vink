// The slice of OpenAPI 3.1 the /v1 document uses. Loose where JSON Schema is
// open-ended; typed where the API reference page (/developers/api) reads it.

export type Schema = {
  $ref?: string;
  type?: string | string[];
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  format?: string;
  example?: unknown;
  [keyword: string]: unknown;
};

export type MediaType = { schema: Schema; example?: unknown };

export type Response = {
  description: string;
  headers?: Record<string, { description: string; schema: Schema }>;
  content?: { "application/json": MediaType };
};

export type Parameter = {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema: Schema;
};

export type Operation = {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: { required?: boolean; description?: string; content: Record<string, MediaType> };
  // A status, or `default`; a value is a Response or a `$ref` to a shared one.
  responses: Record<string, Response | { $ref: string }>;
  // Leave out for the document's default: an API Key.
  security?: Array<Record<string, string[]>>;
};

export type PathItem = Partial<Record<"get" | "post" | "put" | "patch" | "delete", Operation>>;

/** An error code an endpoint can answer with, for the reference's error table. */
export type ErrorCode = { status: number; code: string; meaning: string };

/**
 * One resource's share of the document: its tag, paths (relative to the
 * server URL, so `/forms` is served at `/v1/forms`), schemas and error codes.
 */
export type OpenApiPart = {
  tag: { name: string; description: string };
  paths: Record<string, PathItem>;
  schemas: Record<string, Schema>;
  errors?: ErrorCode[];
};
