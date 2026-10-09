// Vink's Power Automate custom connector, built from the /v1 OpenAPI 3.1
// submission (convex/publicApi/openapi). Power Automate imports Swagger 2.0
// only, so this converts the operations the connector uses and adds
// Microsoft's extensions: the webhook trigger, the Form dropdown and the
// trigger's outputs from the Form's schema. `generate.ts` writes the files.
import { openApiDocument } from "../../convex/publicApi/openapi";
import type { Operation, Parameter, Response, Schema } from "../../convex/publicApi/openapi/types";

type Json = Record<string, unknown>;

/** The operations in the connector, by operationId, with what Power Automate needs beyond the API submission. */
const OPERATIONS: Record<string, { summary?: string; description?: string; extra?: Json }> = {
  createSubscription: {
    summary: "When a Submission is approved",
    description:
      "Starts the flow every time a Submission of the Form is approved in Vink. The outputs are the Form's Fields, under Data.",
    extra: { "x-ms-trigger": "single", "x-ms-trigger-hint": "To see it work, approve a Submission of this Form in Vink." },
  },
  deleteSubscription: { extra: { "x-ms-visibility": "internal" } },
  sendSubmission: {
    summary: "Send in a Submission",
    description:
      "Sends a PDF or a photo to a Form in Vink, as if it was uploaded in the app. Vink reads it; it is approved later, in Vink or by Auto-Send.",
    extra: { "x-ms-visibility": "important" },
  },
  listForms: { extra: { "x-ms-visibility": "internal" } },
  getFormSchema: { extra: { "x-ms-visibility": "internal" } },
};

// The Form dropdown: List Forms, showing each Form's name, sending its id.
const formDropdown = {
  "x-ms-summary": "Form",
  "x-ms-dynamic-values": {
    operationId: "listForms",
    "value-collection": "data",
    "value-path": "id",
    "value-title": "name",
    parameters: {},
  },
};

// The labels Power Automate shows for parameters and body properties.
const SUMMARIES: Record<string, Json> = {
  form_id: formDropdown,
  filename: {
    "x-ms-summary": "File name",
    description: "The name the Submission shows in Vink, for example the attachment's name. Without it: document.pdf, or .jpg, .png or .heic for a photo.",
  },
  id: { "x-ms-summary": "Subscription ID" },
};

/** An OpenAPI 3.1 schema as Swagger 2.0: refs to definitions, one type, `x-nullable` for null. */
function toSwaggerSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toSwaggerSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$ref") out.$ref = (value as string).replace("#/components/schemas/", "#/definitions/");
    else if (key === "type" && Array.isArray(value)) {
      const types = value.filter((t) => t !== "null");
      if (types.length !== 1) throw new Error(`Swagger 2.0 can't express the type ${JSON.stringify(value)}`);
      out.type = types[0];
      if (value.includes("null")) out["x-nullable"] = true;
    } else if (key === "oneOf" || key === "anyOf") throw new Error(`Swagger 2.0 has no ${key}`);
    else if (key === "properties") {
      out.properties = Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k, toSwaggerSchema(v)]));
    } else out[key] = toSwaggerSchema(value);
  }
  return out;
}

function toSwaggerParameter(parameter: Parameter): Json {
  const { type, format, enum: values } = parameter.schema;
  return {
    name: parameter.name,
    in: parameter.in,
    required: parameter.required ?? false,
    description: parameter.description,
    type,
    ...(format ? { format } : {}),
    ...(values ? { enum: values } : {}),
    ...SUMMARIES[parameter.name],
  };
}

function toSwaggerResponse(response: Response | { $ref: string }): Json {
  const resolved =
    "$ref" in response
      ? openApiDocument.components.responses[response.$ref.replace("#/components/responses/", "")]
      : response;
  const json = resolved.content?.["application/json"];
  return {
    description: resolved.description,
    ...(json ? { schema: toSwaggerSchema(json.schema) } : {}),
    ...(resolved.headers
      ? {
          headers: Object.fromEntries(
            Object.entries(resolved.headers).map(([name, header]) => [
              name,
              { type: header.schema.type, description: header.description },
            ]),
          ),
        }
      : {}),
  };
}

/** The request body as Swagger 2.0's one body parameter, and the content type it is sent as. */
function toSwaggerBody(operation: Operation): { consumes: string[]; parameter: Json } | null {
  const body = operation.requestBody;
  if (!body) return null;
  // A file: Power Automate sends file content best as the raw body. It wins over an email's JSON,
  // which the same operation also takes (Vink reads what the file is from its bytes).
  if (body.content["application/octet-stream"]) {
    return {
      consumes: ["application/octet-stream"],
      parameter: {
        name: "file",
        in: "body",
        required: body.required ?? false,
        description: "The file's content (a PDF or a JPG, PNG or HEIC photo), for example from an email attachment or a OneDrive file.",
        "x-ms-summary": "File content",
        schema: { type: "string", format: "binary" },
      },
    };
  }
  const json = body.content["application/json"];
  if (json) {
    const schema = toSwaggerSchema(
      json.schema.$ref
        ? openApiDocument.components.schemas[json.schema.$ref.replace("#/components/schemas/", "")]
        : json.schema,
    ) as Json & { properties: Record<string, Json> };
    // Inlined, so the Form dropdown and the callback URL can sit on its properties.
    for (const [name, property] of Object.entries(schema.properties)) Object.assign(property, SUMMARIES[name]);
    return {
      consumes: ["application/json"],
      parameter: { name: "body", in: "body", required: body.required ?? false, schema },
    };
  }
  throw new Error(`${operation.operationId}: no request body Power Automate can send`);
}

function toSwaggerOperation(operation: Operation): Json {
  const own = OPERATIONS[operation.operationId];
  const body = toSwaggerBody(operation);
  return {
    operationId: operation.operationId,
    summary: own.summary ?? operation.summary,
    description: own.description ?? operation.description,
    ...(body ? { consumes: body.consumes } : {}),
    produces: ["application/json"],
    parameters: [...(operation.parameters ?? []).map(toSwaggerParameter), ...(body ? [body.parameter] : [])],
    responses: Object.fromEntries(
      Object.entries(operation.responses).map(([status, response]) => [status, toSwaggerResponse(response)]),
    ),
    ...own.extra,
  };
}

/** The definitions the operations reach, by `$ref`, converted. */
function definitionsFor(paths: unknown): Record<string, unknown> {
  const all = openApiDocument.components.schemas as Record<string, Schema>;
  const names = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string" && child.startsWith("#/definitions/")) {
        const name = child.replace("#/definitions/", "");
        if (!names.has(name)) {
          names.add(name);
          visit(toSwaggerSchema(all[name]));
        }
      } else visit(child);
    }
  };
  visit(paths);
  return Object.fromEntries([...names].sort().map((name) => [name, toSwaggerSchema(all[name])]));
}

export function buildConnector() {
  const server = new URL(openApiDocument.servers[0].url);
  const paths: Record<string, Json> = {};
  for (const [path, item] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(item) as Array<[string, Operation]>) {
      if (!(operation.operationId in OPERATIONS)) continue;
      paths[path] = { ...paths[path], [method]: toSwaggerOperation(operation) };
    }
  }
  // The trigger's outputs: the envelope Vink POSTs to the callback URL, with
  // the picked Form's Fields from its schema.
  paths["/subscriptions"]["x-ms-notification-content"] = {
    description: "The envelope of the approved Submission.",
    schema: {
      type: "object",
      "x-ms-dynamic-schema": {
        operationId: "getFormSchema",
        parameters: { form_id: { parameter: "form_id" } },
        "value-path": "schema",
      },
      "x-ms-dynamic-properties": {
        operationId: "getFormSchema",
        parameters: { form_id: { parameterReference: "body/form_id" } },
        itemValuePath: "schema",
      },
    },
  };
  const subscriptionUrl = (paths["/subscriptions"].post as { parameters: Json[] }).parameters[0] as {
    schema: { properties: { url: Json } };
  };
  Object.assign(subscriptionUrl.schema.properties.url, { "x-ms-notification-url": true, "x-ms-visibility": "internal" });

  const apiDefinition = {
    swagger: "2.0",
    info: {
      title: "Vink",
      description:
        "Vink reads PDFs into the Fields of your Forms. Start a flow when a Submission is approved, and send PDFs in to be read.",
      version: "1.0",
      contact: { name: "Vink", url: "https://vink.page/developers" },
    },
    host: server.host,
    basePath: server.pathname,
    schemes: ["https"],
    consumes: ["application/json"],
    produces: ["application/json"],
    paths,
    definitions: definitionsFor(paths),
    securityDefinitions: { api_key: { type: "apiKey", in: "header", name: "Authorization" } },
    security: [{ api_key: [] }],
    "x-ms-connector-metadata": [
      { propertyName: "Website", propertyValue: "https://vink.page" },
      { propertyName: "Privacy policy", propertyValue: "https://vink.page/privacy" },
      { propertyName: "Categories", propertyValue: "Productivity;Business Management" },
    ],
  };

  const apiProperties = {
    properties: {
      connectionParameters: {
        api_key: {
          type: "securestring",
          uiDefinition: {
            displayName: "API Key",
            description: "Type Bearer, a space, then your Vink API Key: Bearer vink_live_…",
            tooltip: "An Admin makes API Keys in Vink, under Organisation settings → API Keys.",
            constraints: { tabIndex: 2, clearText: false, required: "true" },
          },
        },
      },
      iconBrandColor: "#0f1e36",
      capabilities: ["actions", "triggers"],
      publisher: "Vink",
      stackOwner: "Vink",
    },
  };

  return { apiDefinition, apiProperties };
}
