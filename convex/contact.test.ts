import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { newBackend } from "./test.setup";

// The contact and integration-service form, as the Next app's /api/contact
// route forwards it. Resend is the only external system: every mail it was
// asked to send lands in `sent`.

type Backend = ReturnType<typeof newBackend>;

const PROXY_SECRET = "proxy-secret-for-tests";
const MINUTE = 60 * 1000;

let sent: Array<{ from: string; to: string[]; subject: string; html: string; reply_to?: string }>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("CONTACT_TO", "rob@vink.test");
  vi.stubEnv("VINK_PROXY_SECRET", PROXY_SECRET);
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = {
  kind: "integration",
  name: "Marieke Hoekstra",
  email: "marieke@hoekstra-transport.nl",
  company: "Hoekstra Transport",
  system: "Exact Online",
  documents: "Delivery notes and invoices",
  pagesPerMonth: "about 1,500",
  message: "Can it book invoices <straight> into Exact?",
  locale: "nl",
};

async function submit(t: Backend, body: unknown, { ip = "203.0.113.7", proxied = true } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (proxied) {
    headers["x-vink-client-ip"] = ip;
    headers["x-vink-proxy-secret"] = PROXY_SECRET;
  }
  const response = await t.fetch("/contact", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("a request is emailed once to CONTACT_TO, with Reply-To set to the visitor", async () => {
  const t = newBackend();

  expect(await submit(t, request)).toEqual({ status: 200, body: { ok: true } });

  expect(sent).toHaveLength(1);
  const [mail] = sent;
  expect(mail.to).toEqual(["rob@vink.test"]);
  expect(mail.reply_to).toBe("marieke@hoekstra-transport.nl");
  expect(mail.subject).toBe("Integration request: Marieke Hoekstra, Hoekstra Transport");
  for (const value of ["Marieke Hoekstra", "Exact Online", "Delivery notes and invoices", "about 1,500"]) {
    expect(mail.html).toContain(value);
  }
  // What the visitor typed is shown, never run as HTML.
  expect(mail.html).toContain("&#60;straight&#62;");
  expect(mail.html).not.toContain("<straight>");
});

test("a general contact message needs only a name and an email", async () => {
  const t = newBackend();

  const response = await submit(t, { kind: "contact", name: "Jan de Vries", email: "jan@gmail.com", message: "Hoi" });

  expect(response).toEqual({ status: 200, body: { ok: true } });
  expect(sent[0].subject).toBe("Contact: Jan de Vries");
  expect(sent[0].reply_to).toBe("jan@gmail.com");
});

test("a filled honeypot looks like success to the bot, but nothing is sent", async () => {
  const t = newBackend();

  const response = await submit(t, { ...request, website: "https://cheap-pills.example" });

  expect(response).toEqual({ status: 200, body: { ok: true } });
  expect(sent).toEqual([]);
});

test("an email address that isn't one is refused", async () => {
  const t = newBackend();

  for (const email of ["marieke", "marieke@", "marieke@hoekstra", "mar ieke@hoekstra.nl", "a@b.nl\nBcc: x@y.nl"]) {
    expect(await submit(t, { ...request, email })).toEqual({ status: 400, body: { error: "invalid_email" } });
  }
  expect(sent).toEqual([]);
});

test("a request without a kind or a name, or that isn't JSON, is refused", async () => {
  const t = newBackend();

  expect(await submit(t, { ...request, kind: "spam" })).toEqual({ status: 400, body: { error: "invalid" } });
  expect(await submit(t, { ...request, name: " " })).toEqual({ status: 400, body: { error: "invalid" } });
  expect(await submit(t, { ...request, message: 42 })).toEqual({ status: 400, body: { error: "invalid" } });
  expect(await submit(t, { ...request, message: "x".repeat(10_001) })).toEqual({
    status: 400,
    body: { error: "invalid" },
  });
  expect(await submit(t, "not json")).toEqual({ status: 400, body: { error: "invalid" } });
  expect(sent).toEqual([]);
});

test("about 5 requests an hour per IP; the next is refused until the hour is over", async () => {
  const t = newBackend();
  for (let i = 0; i < 5; i++) {
    expect((await submit(t, request)).status).toBe(200);
  }

  expect(await submit(t, request)).toEqual({ status: 429, body: { error: "rate_limited" } });
  expect((await submit(t, request, { ip: "198.51.100.20" })).status).toBe(200);
  expect(sent).toHaveLength(6);

  vi.setSystemTime(Date.now() + 61 * MINUTE);
  expect((await submit(t, request)).status).toBe(200);
});

test("a caller going around the Next app is refused", async () => {
  const t = newBackend();

  const response = await submit(t, request, { proxied: false });

  expect(response.status).toBe(403);
  expect(sent).toEqual([]);
});

test("nothing of a request is stored: at most a hash of the IP and the times", async () => {
  const t = newBackend();
  await submit(t, request);
  await submit(t, { ...request, website: "bot" });

  const everything = await t.run(async (ctx) => {
    const rows: Record<string, unknown[]> = {};
    for (const table of Object.keys(schema.tables) as Array<keyof typeof schema.tables>) {
      rows[table] = await ctx.db.query(table).collect();
    }
    return rows;
  });
  const stored = JSON.stringify(everything);
  for (const value of ["Marieke", "hoekstra", "Exact", "1,500", "203.0.113.7"]) {
    expect(stored).not.toContain(value);
  }
  const kept = Object.entries(everything).filter(([, rows]) => rows.length > 0);
  expect(kept.map(([table]) => table)).toEqual(["contactRateLimits"]);
  expect(Object.keys(kept[0][1][0] as object).sort()).toEqual(["_creationTime", "_id", "ipHash", "lastAt", "times"]);

  // An hour later the daily cleanup forgets it.
  vi.setSystemTime(Date.now() + 61 * MINUTE);
  await t.mutation(internal.retention.run, {});
  expect(await t.run(async (ctx) => await ctx.db.query("contactRateLimits").collect())).toEqual([]);
});
