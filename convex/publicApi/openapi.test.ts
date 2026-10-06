import { expect, test } from "vitest";
import { api } from "../_generated/api";
import { newBackend, signUp } from "../test.setup";
import { openApiDocument } from "./openapi";
import { routes } from "./routes";

test("every /v1 route is in the OpenAPI document, and nothing else is", () => {
  const routed = routes
    .filter((r) => r.path !== "/v1/openapi.json")
    .map((r) => `${r.method} ${r.path.replace(/^\/v1/, "")}`)
    .sort();
  const documented = Object.entries(openApiDocument.paths)
    .flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`))
    .sort();
  expect(documented).toEqual(routed);
});

test("GET /v1/forms answers with only the keys the Form and Field schemas document", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Work order",
    fields: [
      { type: "choice", label: "Soort", key: "kind", required: false, options: [{ value: "repair" }] },
      {
        type: "list",
        label: "Regels",
        key: "lines",
        required: false,
        fields: [{ type: "text", label: "Omschrijving", key: "description", required: true }],
      },
    ],
  });
  const { key } = await ann.user.mutation(api.apiKeys.create, { organisationSlug: ann.slug, name: "Docs" });
  const response = await t.fetch("/v1/forms", { headers: { Authorization: `Bearer ${key}` } });
  const [form] = (await response.json()).data;

  const { Form, Field, SubField } = openApiDocument.components.schemas;
  const documented = (schema: typeof Form) => Object.keys(schema.properties ?? {});
  expect(documented(Form)).toEqual(expect.arrayContaining(Object.keys(form)));
  expect(Form.required).toEqual(expect.arrayContaining(Object.keys(form)));
  for (const field of form.fields) expect(documented(Field)).toEqual(expect.arrayContaining(Object.keys(field)));
  expect(documented(SubField)).toEqual(expect.arrayContaining(Object.keys(form.fields[1].fields[0])));
});
