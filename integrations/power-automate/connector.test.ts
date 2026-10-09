// The Power Automate connector is a Swagger 2.0 file Power Automate imports.
// `paconn validate` needs a Microsoft login, so these checks stand in for it:
// Swagger 2.0's shape, Power Automate's extensions, and that every operation
// is a real /v1 route with the same method, path and parameters.
import { expect, test } from "vitest";
import { openApiDocument } from "@/convex/publicApi/openapi";
import { buildConnector } from "./connector";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { apiDefinition, apiProperties } = buildConnector();
const METHODS = ["get", "post", "put", "patch", "delete"];

const operations = Object.entries(apiDefinition.paths as Json).flatMap(([path, item]) =>
  Object.entries(item as Json)
    .filter(([method]) => METHODS.includes(method))
    .map(([method, operation]) => ({ path, method, operation: operation as Json, item: item as Json })),
);
const byId = (operationId: string) => operations.find((o) => o.operation.operationId === operationId)!;

/** Every value anywhere in the definition, with its JSON path. */
function walk(value: unknown, path = "", out: Array<[string, unknown]> = []) {
  out.push([path, value]);
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}/${k}`, out);
  }
  return out;
}

test("is Swagger 2.0 for https://vink.page/v1, with API Key auth in the Authorization header", () => {
  expect(apiDefinition.swagger).toBe("2.0");
  expect(`https://${apiDefinition.host}${apiDefinition.basePath}`).toBe(openApiDocument.servers[0].url);
  expect(apiDefinition.schemes).toEqual(["https"]);
  expect(apiDefinition.securityDefinitions).toEqual({
    api_key: { type: "apiKey", in: "header", name: "Authorization" },
  });
  expect(apiDefinition.security).toEqual([{ api_key: [] }]);
  expect(apiProperties.properties.connectionParameters).toEqual({
    api_key: expect.objectContaining({ type: "securestring" }),
  });
});

test("every operation is a /v1 route with the same method, operationId and parameters", () => {
  expect(operations.length).toBeGreaterThan(0);
  for (const { path, method, operation } of operations) {
    const source = (openApiDocument.paths as Json)[path]?.[method];
    expect(source, `${method} ${path}`).toBeDefined();
    expect(operation.operationId).toBe(source.operationId);
    const named = (operation.parameters ?? []).filter((p: Json) => p.in === "path" || p.in === "query");
    expect(named.map((p: Json) => `${p.in} ${p.name}`).sort()).toEqual(
      (source.parameters ?? []).map((p: Json) => `${p.in} ${p.name}`).sort(),
    );
    const bodies = (operation.parameters ?? []).filter((p: Json) => p.in === "body");
    expect(bodies.length).toBe(source.requestBody ? 1 : 0);
  }
});

test("only Swagger 2.0 constructs: refs to definitions that exist, single types, no OpenAPI 3 keywords", () => {
  const definitions = Object.keys(apiDefinition.definitions);
  for (const [path, value] of walk(apiDefinition)) {
    const key = path.split("/").pop();
    if (key === "$ref") {
      expect(value, path).toMatch(/^#\/definitions\//);
      expect(definitions, path).toContain((value as string).replace("#/definitions/", ""));
    }
    if (key === "type" && !path.includes("/properties/type")) expect(typeof value, path).toBe("string");
    for (const banned of ["requestBody", "components", "oneOf", "anyOf", "nullable", "content", "servers"]) {
      expect(key === banned && !path.includes("/properties/"), path).toBe(false);
    }
  }
  for (const { operation } of operations) {
    for (const parameter of operation.parameters ?? []) {
      if (parameter.in === "body") expect(parameter.schema).toBeDefined();
      else expect([parameter.type, parameter.schema]).toEqual([expect.any(String), undefined]);
    }
  }
});

test("the trigger subscribes with Power Automate's callback URL, unsubscribes by the Location header", () => {
  const trigger = byId("createSubscription");
  expect(trigger.operation["x-ms-trigger"]).toBe("single");
  expect(trigger.operation.summary).toBe("When a Submission is approved");
  const body = trigger.operation.parameters.find((p: Json) => p.in === "body").schema;
  expect(body.properties.url).toMatchObject({ "x-ms-notification-url": true, "x-ms-visibility": "internal" });
  expect(body.properties.form_id["x-ms-dynamic-values"]).toMatchObject({ operationId: "listForms" });
  expect(trigger.operation.responses["201"].headers.Location).toMatchObject({ type: "string" });

  // Power Automate DELETEs the Location URL, /v1/subscriptions/<id>: that path needs a delete operation.
  expect(byId("deleteSubscription")).toMatchObject({ method: "delete", path: "/subscriptions/{id}" });
  expect(byId("deleteSubscription").operation["x-ms-visibility"]).toBe("internal");

  // The trigger's outputs are the Form's envelope, from its schema.
  const content = trigger.item["x-ms-notification-content"].schema;
  expect(content["x-ms-dynamic-schema"]).toEqual({
    operationId: "getFormSchema",
    parameters: { form_id: { parameter: "form_id" } },
    "value-path": "schema",
  });
  expect(content["x-ms-dynamic-properties"]).toEqual({
    operationId: "getFormSchema",
    parameters: { form_id: { parameterReference: "body/form_id" } },
    itemValuePath: "schema",
  });
});

test("dynamic values and schemas call operations that exist, and their paths are in those answers", () => {
  const definitions = apiDefinition.definitions as Json;
  const resolve = (schema: Json): Json => (schema.$ref ? definitions[schema.$ref.split("/").pop()] : schema);
  const schemaAt = (operationId: string) => resolve(byId(operationId).operation.responses["200"].schema);
  for (const [path, value] of walk(apiDefinition)) {
    const key = path.split("/").pop();
    if (key === "x-ms-dynamic-values") {
      const { operationId, "value-collection": collection, "value-path": valuePath, "value-title": title } =
        value as Json;
      const list = schemaAt(operationId).properties[collection];
      const item = resolve(list.items);
      expect(Object.keys(item.properties), path).toEqual(expect.arrayContaining([valuePath, title]));
      expect(byId(operationId).operation["x-ms-visibility"], path).toBe("internal");
    }
    if (key === "x-ms-dynamic-schema") {
      const { operationId, "value-path": valuePath } = value as Json;
      expect(schemaAt(operationId).properties[valuePath], path).toBeDefined();
    }
  }
});

test("the action sends the file content in as the raw PDF body, to a Form picked from a list", () => {
  const { operation } = byId("sendSubmission");
  expect(operation.summary).toBe("Send in a Submission");
  expect(operation["x-ms-trigger"]).toBeUndefined();
  expect(operation.consumes).toEqual(["application/octet-stream"]);
  const [formId, filename, file] = ["form_id", "filename", "file"].map((name) =>
    operation.parameters.find((p: Json) => p.name === name),
  );
  expect(formId).toMatchObject({ in: "path", "x-ms-dynamic-values": { operationId: "listForms" } });
  expect(filename).toMatchObject({ in: "query", type: "string" });
  expect(file).toMatchObject({ in: "body", required: true, schema: { type: "string", format: "binary" } });
  expect((openApiDocument.paths as Json)["/forms/{form_id}/submissions"].post.requestBody.content).toHaveProperty(
    "application/octet-stream",
  );
});

test("the files on the Developers page are this generator's output (npx tsx integrations/power-automate/generate.ts)", async () => {
  const definition = await import("@/public/power-automate/apiDefinition.swagger.json");
  const properties = await import("@/public/power-automate/apiProperties.json");
  expect(definition.default).toEqual(JSON.parse(JSON.stringify(apiDefinition)));
  expect(properties.default).toEqual(apiProperties);
});
