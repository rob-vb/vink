// @vitest-environment node
// The Make app (src/) checked without Make: every file makecomapp.json names
// exists and parses, and every request it makes is an endpoint of the /v1 API.
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { openApiDocument } from "../../convex/publicApi/openapi";
import type { Response } from "../../convex/publicApi/openapi/types";

const appDir = join(__dirname, "src");
const read = (path: string) => readFileSync(join(appDir, path), "utf8");
const manifest = JSON.parse(read("makecomapp.json"));

/** Every code file of the app and its components, as [label, path]. */
const codeFiles = (): Array<[string, string]> => [
  ...Object.entries(manifest.generalCodeFiles as Record<string, string | null>).map(
    ([code, path]) => [`app ${code}`, path] as [string, string | null],
  ),
  ...Object.entries(manifest.components as Record<string, Record<string, { codeFiles: Record<string, string | null> }>>)
    .flatMap(([type, components]) => Object.entries(components).map(([id, c]) => [`${type} ${id}`, c] as const))
    .flatMap(([name, component]) =>
      Object.entries(component.codeFiles).map(([code, path]) => [`${name} ${code}`, path] as [string, string | null]),
    ),
].filter((entry): entry is [string, string] => entry[1] !== null);

describe("makecomapp.json", () => {
  test("names files that exist and parse", () => {
    expect(codeFiles().length).toBeGreaterThan(0);
    for (const [name, path] of codeFiles()) {
      expect(existsSync(join(appDir, path)), `${name}: ${path}`).toBe(true);
      if (path.endsWith(".json")) expect(() => JSON.parse(read(path)), `${name}: ${path}`).not.toThrow();
      if (path.endsWith(".js")) expect(() => new Function(read(path)), `${name}: ${path}`).not.toThrow();
    }
  });
});

const API_BASE_URL = openApiDocument.servers[0].url;
const base = JSON.parse(read(manifest.generalCodeFiles.base));

type Request = { url?: string; method?: string; response?: { error?: { message?: string } } };

/** Every HTTP request the app makes: communications, attach and detach. */
const requests = (): Array<{ name: string; request: Request; inheritsBase: boolean }> =>
  Object.entries(manifest.components as Record<string, Record<string, { codeFiles: Record<string, string | null> }>>)
    .flatMap(([type, components]) =>
      Object.entries(components).flatMap(([id, component]) =>
        Object.entries(component.codeFiles)
          .filter(([code, path]) => path && ["communication", "attach", "detach"].includes(code))
          .flatMap(([code, path]) => {
            const parsed: Request | Request[] = JSON.parse(read(path!));
            return (Array.isArray(parsed) ? parsed : [parsed]).map((request) => ({
              name: `${type} ${id} ${code}`,
              request,
              // Base applies to modules and RPCs; the others carry their own URL and header.
              inheritsBase: type === "module" || type === "rpc",
            }));
          }),
      ),
    )
    .filter(({ request }) => request.url !== undefined);

/** The OpenAPI path (e.g. `/forms/{form_id}/sample`) a request URL lands on, or null. */
const apiPath = (url: string) => {
  const path = url.startsWith(API_BASE_URL) ? url.slice(API_BASE_URL.length) : url;
  const concrete = path.replace(/\{\{[^}]+\}\}/g, "x");
  return (
    Object.keys(openApiDocument.paths).find((template) =>
      new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(concrete),
    ) ?? null
  );
};

describe("requests", () => {
  test("Base points at the API and sends the connection's API Key as a Bearer token", () => {
    expect(base.baseUrl).toBe(API_BASE_URL);
    expect(base.headers.authorization).toBe("Bearer {{connection.apiKey}}");
  });

  test("every request is an endpoint and method of the OpenAPI document", () => {
    const called = requests().map(({ name, request, inheritsBase }) => {
      const url = request.url!;
      expect(url.startsWith(API_BASE_URL) || (inheritsBase && url.startsWith("/")), `${name}: ${url}`).toBe(true);
      const path = apiPath(url);
      expect(path, `${name}: ${url}`).not.toBeNull();
      const method = (request.method ?? "GET").toLowerCase() as "get" | "post" | "delete";
      const operation = openApiDocument.paths[path!][method];
      expect(operation, `${name}: ${method} ${path}`).toBeDefined();
      return operation!.operationId;
    });
    expect(new Set(called)).toEqual(
      new Set(["listForms", "sendDocument", "createSubscription", "deleteSubscription", "getFormSample"]),
    );
  });

  test("a refusal shows Vink's error message", () => {
    const own = requests().filter(({ inheritsBase }) => !inheritsBase);
    for (const { name, request } of [{ name: "base", request: base }, ...own]) {
      expect(request.response?.error?.message, name).toContain("body.error.message");
    }
  });
});

describe("references", () => {
  const all = codeFiles().filter(([, path]) => path.endsWith(".json"));

  test("every rpc:// names an RPC of the app", () => {
    const rpcs = all.flatMap(([, path]) => [...read(path).matchAll(/rpc:\/\/(\w+)/g)].map((match) => match[1]));
    expect(rpcs.length).toBeGreaterThan(0);
    for (const rpc of rpcs) expect(manifest.components.rpc, rpc).toHaveProperty(rpc);
  });

  test("connections, webhooks and grouped modules exist", () => {
    for (const type of ["webhook", "module", "rpc"]) {
      for (const [id, component] of Object.entries<{ connection?: string; webhook?: string }>(
        manifest.components[type],
      )) {
        if (component.connection) expect(manifest.components.connection, `${type} ${id}`).toHaveProperty(component.connection);
        if (component.webhook) expect(manifest.components.webhook, `${type} ${id}`).toHaveProperty(component.webhook);
      }
    }
    const groups: Array<{ modules: string[] }> = JSON.parse(read(manifest.generalCodeFiles.groups));
    expect(groups.flatMap((group) => group.modules).sort()).toEqual(Object.keys(manifest.components.module).sort());
  });
});

/** A custom IML function, loaded the way Make runs it: a bare function declaration. */
const imlFunction = (id: string) => {
  const { code } = manifest.components.function[id].codeFiles;
  return new Function(`${read(code)}\nreturn ${id};`)() as (...args: unknown[]) => unknown;
};

describe("formFieldsSpec (custom IML function)", () => {
  test("passes its own Make IML tests", () => {
    const { code, test: tests } = manifest.components.function.formFieldsSpec.codeFiles;
    const cases: Array<{ name: string; run: () => void }> = [];
    new Function("it", "assert", `${read(code)}\n${read(tests)}`)(
      (name: string, run: () => void) => cases.push({ name, run }),
      assert,
    );
    expect(cases.length).toBeGreaterThan(0);
    for (const { name, run } of cases) expect(run, name).not.toThrow();
  });

  test("turns the API reference's example Form into the trigger's data collection", () => {
    const listForms = openApiDocument.paths["/forms"].get!.responses["200"] as Response;
    const { data } = listForms.content!["application/json"].example as { data: Array<{ id: string }> };
    expect(imlFunction("formFieldsSpec")(data, data[0].id)).toEqual({
      name: "data",
      label: "Fields",
      type: "collection",
      spec: [
        { name: "supplier", label: "Leverancier", type: "text" },
        { name: "invoice_number", label: "Factuurnummer", type: "text" },
        { name: "invoice_date", label: "Factuurdatum", type: "date" },
        { name: "total_amount", label: "Totaalbedrag", type: "number" },
        { name: "currency", label: "Valuta", type: "text" },
        {
          name: "lines",
          label: "Regels",
          type: "array",
          spec: [
            { name: "description", label: "Omschrijving", type: "text" },
            { name: "quantity", label: "Aantal", type: "number" },
            { name: "amount", label: "Bedrag", type: "number" },
          ],
        },
      ],
    });
  });
});
