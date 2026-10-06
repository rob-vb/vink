import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMembership, newBackend, signUp } from "./test.setup";

type Backend = ReturnType<typeof newBackend>;

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Fleet");
  return { ann: ann.user, organisationSlug: ann.slug };
}

function sha256Hex(text: string) {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(text))
    .then((d) => Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join(""));
}

test("an Admin makes a named API Key; it is shown once and stored only as its hash", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);

  const { key } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "  Zapier  " });

  expect(key).toMatch(/^vink_live_[0-9A-Za-z]{40}$/);
  const stored = await t.run(async (ctx) => await ctx.db.query("apiKeys").collect());
  expect(stored).toHaveLength(1);
  expect(stored[0].keyHash).toBe(await sha256Hex(key));
  expect(JSON.stringify(stored)).not.toContain(key.slice("vink_live_".length));

  const listed = await ann.query(api.apiKeys.list, { organisationSlug });
  expect(listed).toEqual([
    {
      id: stored[0]._id,
      name: "Zapier",
      hint: `vink_live_…${key.slice(-4)}`,
      createdAt: stored[0]._creationTime,
      lastUsedAt: null,
    },
  ]);
  expect(JSON.stringify(listed)).not.toContain(key);
});

test("every key is different", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const a = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "A" });
  const b = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "B" });
  expect(a.key).not.toBe(b.key);
});

test("an API Key needs a name", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  await expect(ann.mutation(api.apiKeys.create, { organisationSlug, name: "  " })).rejects.toThrow(
    "An API Key needs a name",
  );
});

test("a Member can't see, make or revoke API Keys", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { apiKeyId } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const bob = await addMembership(t, "bob", organisationSlug, "member");

  await expect(bob.query(api.apiKeys.list, { organisationSlug })).rejects.toThrow("Forbidden");
  await expect(bob.mutation(api.apiKeys.create, { organisationSlug, name: "Mine" })).rejects.toThrow(
    "Forbidden",
  );
  await expect(bob.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId })).rejects.toThrow(
    "Forbidden",
  );
});

test("an Admin can't see or revoke another Organisation's keys", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { apiKeyId } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const zoe = await signUp(t, "zoe", "Zoe Transport");

  expect(await zoe.user.query(api.apiKeys.list, { organisationSlug: zoe.slug })).toEqual([]);
  await expect(
    zoe.user.mutation(api.apiKeys.revoke, { organisationSlug: zoe.slug, apiKeyId }),
  ).rejects.toThrow("API Key not found");
  expect(await ann.query(api.apiKeys.list, { organisationSlug })).toHaveLength(1);
});

async function get(t: Backend, path: string, key?: string) {
  const response = await t.fetch(path, {
    method: "GET",
    headers: key === undefined ? {} : { Authorization: `Bearer ${key}` },
  });
  return { status: response.status, type: response.headers.get("content-type"), body: await response.json() };
}

test("a missing, unknown or revoked key gets 401 with a JSON error", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { apiKeyId, key } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const other = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Make" });

  expect(await get(t, "/v1/forms")).toEqual({
    status: 401,
    type: "application/json",
    body: {
      error: {
        code: "missing_api_key",
        message: "Send your API Key in the Authorization header: Bearer <key>.",
      },
    },
  });
  const unknown = await get(t, "/v1/forms", "vink_live_" + "x".repeat(40));
  expect(unknown.status).toBe(401);
  expect(unknown.body.error.code).toBe("invalid_api_key");
  expect(await t.fetch("/v1/forms", { headers: { Authorization: key } }).then((r) => r.status)).toBe(401);

  expect((await get(t, "/v1/forms", key)).status).toBe(200);
  await ann.mutation(api.apiKeys.revoke, { organisationSlug, apiKeyId });
  expect(await get(t, "/v1/forms", key)).toMatchObject({
    status: 401,
    body: { error: { code: "invalid_api_key" } },
  });
  // Revoking one key leaves the others working.
  expect((await get(t, "/v1/forms", other.key)).status).toBe(200);
});

test("GET /v1/forms returns the key's own Organisation's Forms with their current Fields", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { formId } = await ann.mutation(api.forms.create, {
    organisationSlug,
    name: "Work order",
    description: "Garage work orders",
    fields: [{ type: "text", label: "Kenteken", key: "license_plate", required: true }],
  });
  await ann.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Work order",
    description: "Garage work orders",
    fields: [
      { type: "text", label: "Kenteken", key: "license_plate", required: true },
      {
        type: "choice",
        label: "Soort",
        key: "kind",
        required: false,
        description: "Only for extraction",
        options: [{ value: "repair" }, { value: "service", description: "onderhoud" }],
      },
      {
        type: "list",
        label: "Regels",
        key: "lines",
        required: false,
        fields: [
          { type: "text", label: "Omschrijving", key: "description", required: true },
          { type: "number", label: "Aantal", key: "quantity", required: false },
        ],
      },
    ],
  });
  const { key } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const zoe = await signUp(t, "zoe", "Zoe Transport");
  await zoe.user.mutation(api.forms.create, {
    organisationSlug: zoe.slug,
    name: "Zoe's invoice",
    fields: [{ type: "text", label: "Total", key: "total", required: true }],
  });
  const zoeKey = await zoe.user.mutation(api.apiKeys.create, { organisationSlug: zoe.slug, name: "Zoe" });

  expect(await get(t, "/v1/forms", key)).toEqual({
    status: 200,
    type: "application/json",
    body: {
      data: [
        {
          id: formId,
          name: "Work order",
          description: "Garage work orders",
          version: 2,
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
        },
      ],
    },
  });
  const zoes = await get(t, "/v1/forms", zoeKey.key);
  expect(zoes.body.data.map((f: { name: string }) => f.name)).toEqual(["Zoe's invoice"]);
});

test("last used is written at most once an hour", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { key } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  const lastUsed = async () => (await ann.query(api.apiKeys.list, { organisationSlug }))[0].lastUsedAt;

  const first = Date.now();
  await get(t, "/v1/forms", key);
  expect(await lastUsed()).toBe(first);

  vi.advanceTimersByTime(HOUR / 2);
  await get(t, "/v1/forms", key);
  expect(await lastUsed()).toBe(first);

  vi.advanceTimersByTime(HOUR);
  await get(t, "/v1/forms", key);
  expect(await lastUsed()).toBe(first + HOUR * 1.5);
});

test("an unknown /v1 path gets 404 in the same error shape", async () => {
  const t = newBackend();
  const { ann, organisationSlug } = await acme(t);
  const { key } = await ann.mutation(api.apiKeys.create, { organisationSlug, name: "Zapier" });
  expect(await get(t, "/v1/nothing-here", key)).toEqual({
    status: 404,
    type: "application/json",
    body: { error: { code: "not_found", message: "There's no GET /v1/nothing-here." } },
  });
});

test("a known /v1 path with the wrong method gets 405", async () => {
  const t = newBackend();
  const response = await t.fetch("/v1/forms", { method: "DELETE" });
  expect(response.status).toBe(405);
  expect(await response.json()).toEqual({
    error: { code: "method_not_allowed", message: "/v1/forms doesn't take DELETE." },
  });
});

test("the OpenAPI document is served without a key and describes GET /forms", async () => {
  const t = newBackend();
  const { status, body } = await get(t, "/v1/openapi.json");
  expect(status).toBe(200);
  expect(body.openapi).toBe("3.1.0");
  expect(body.servers).toEqual([{ url: "https://vink.page/v1" }]);
  expect(body.components.securitySchemes.apiKey).toMatchObject({ type: "http", scheme: "bearer" });
  expect(body.paths["/forms"].get.responses).toHaveProperty("200");
  expect(body.paths["/forms"].get.responses).toHaveProperty("401");
});
