/// <reference types="vite/client" />
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { expect, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  FilledValue,
  Filler,
  ListMatch,
  Match,
  Matcher,
  PageText,
  ProposedField,
  Proposer,
  Reader,
  Reading,
  Verification,
  Verifier,
} from "./lib/pipeline";
import schema from "./schema";

export const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

export function newBackend() {
  const t = convexTest(schema, modules);
  workpool.register(t, "extractionPool");
  return t;
}

type Backend = ReturnType<typeof newBackend>;
type User = ReturnType<Backend["withIdentity"]>;

/** Call as a signed-in user, with no Organisation yet. Their email is `<userId>@example.com`. */
export function asUser(t: Backend, userId: string) {
  return t.withIdentity({ subject: userId, email: `${userId}@example.com` });
}

/** A user signs up and gets their own Organisation; returns them and its slug. */
export async function signUp(t: Backend, userId: string, organisationName: string) {
  const user = asUser(t, userId);
  const { slug } = await user.mutation(api.onboarding.createOrganisation, {
    name: organisationName,
  });
  return { user, slug };
}

/**
 * Gives a user a Membership in an existing Organisation, skipping the
 * Invitation (see invitations.test.ts for that path).
 */
export async function addMembership(
  t: Backend,
  userId: string,
  organisationSlug: string,
  role: "admin" | "member",
) {
  await t.run(async (ctx) => {
    const organisation = await ctx.db
      .query("organisations")
      .withIndex("by_slug", (q) => q.eq("slug", organisationSlug))
      .unique();
    await ctx.db.insert("memberships", {
      organisationId: organisation!._id,
      userId,
      email: `${userId}@example.com`,
      role,
    });
  });
  return asUser(t, userId);
}

/**
 * Stands in for R2 (see lib/pdfStore.ts): objects live in `objects`, and an
 * upload URL is the object's key behind a fake host. Install it in a test file
 * with `vi.mock("./lib/pdfStore", () => ({ pdfStore: fakePdfStore }))`.
 */
export const fakePdfStore = {
  objects: new Map<string, Uint8Array>(),
  async uploadUrl(key: string) {
    return `https://r2.test/upload/${key}`;
  },
  async read(key: string) {
    return fakePdfStore.objects.get(key) ?? null;
  },
  async remove(_ctx: unknown, key: string) {
    fakePdfStore.objects.delete(key);
  },
  async viewUrl(key: string, expiresInSeconds: number) {
    return `https://r2.test/view/${key}?expires=${expiresInSeconds}`;
  },
};

/** What the browser does with an upload URL: PUT the bytes there. */
export function putToUploadUrl(url: string, bytes: Uint8Array) {
  fakePdfStore.objects.set(url.replace("https://r2.test/upload/", ""), bytes);
}

export async function pdfWithPages(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return await pdf.save();
}

/** Uploads a PDF and lets the Extraction it starts run to the end. */
export async function uploadAndExtract(
  t: Backend,
  user: User,
  organisationSlug: string,
  formId: Id<"forms">,
  pages = 1,
) {
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, {
    organisationSlug,
  });
  putToUploadUrl(url, await pdfWithPages(pages));
  await user.action(api.documents.create, {
    organisationSlug,
    formId,
    key,
    filename: "werkorder.pdf",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const { documents } = await user.query(api.documents.list, {
    organisationSlug,
    state: "needs_review",
  });
  return documents[0]?.id;
}

/**
 * What the Extraction's Reader, Matcher, Filler and Verifier answer for one
 * Document: recorded from a real run (see fixtures/), or written by hand.
 */
export type Recording = {
  reading: Reading;
  /** The pages with a text layer; none (a scan) when left out. */
  textLayer?: PageText[];
  /** Per top-level Field key; a Field left out is matched to `none`. */
  matches: Record<string, Match>;
  /** Per List Field key; a List left out, or a sub-Field, is matched to `none`. */
  lists?: Record<string, ListMatch>;
  /** Per value id (see FillRequest), what Fill writes from the matched source. */
  fills: Record<string, FilledValue>;
  /**
   * Per value id, Jev's fit and support; 1 for a value left out. Support is
   * only answered when it was asked.
   */
  verifications?: Record<string, { fit: number; support: number }>;
  /** What the Proposer suggests for a Form Proposal of this sample. */
  proposal?: ProposedField[];
};

type Step = "read" | "match" | "fill" | "verify" | "propose";

/**
 * Stands in for the Extraction's adapters (lib/reader.ts, lib/matcher.ts,
 * lib/filler.ts and lib/verifier.ts) by replaying a Recording, and logs every
 * call. Install each fake with `vi.mock`, as for fakePdfStore.
 */
export const fakePipeline = {
  recording: null as Recording | null,
  failing: new Map<Step, number>(),
  calls: [] as Array<
    | { step: "read" }
    | { step: "match"; reading: Reading; fields: string[]; lists: string[] }
    | { step: "fill"; fields: string[] }
    | { step: "verify"; fields: string[]; supportAskedFor: string[] }
    | { step: "propose"; reading: Reading }
  >,
  replay(recording: Recording) {
    fakePipeline.recording = recording;
  },
  /** The next call to that step throws, as an outage would. */
  failOnce(step: Step) {
    fakePipeline.failTimes(step, 1);
  },
  /** The next `times` calls to that step throw. */
  failTimes(step: Step, times: number) {
    fakePipeline.failing.set(step, times);
  },
  reset() {
    fakePipeline.recording = null;
    fakePipeline.failing.clear();
    fakePipeline.calls = [];
  },
  failIfAsked(step: Step) {
    const left = fakePipeline.failing.get(step) ?? 0;
    if (left > 0) {
      fakePipeline.failing.set(step, left - 1);
      throw new Error(`${step} is down`);
    }
  },
  played() {
    if (fakePipeline.recording === null) throw new Error("No Recording to replay");
    return fakePipeline.recording;
  },
};

export const fakeReader: Reader = {
  async read() {
    fakePipeline.calls.push({ step: "read" });
    fakePipeline.failIfAsked("read");
    const { reading, textLayer = [] } = fakePipeline.played();
    return { reading, textLayer };
  },
};

export const fakeMatcher: Matcher = {
  async match(reading, { fields, lists }) {
    fakePipeline.calls.push({
      step: "match",
      reading,
      fields: fields.map((f) => f.key),
      lists: lists.map((l) => l.key),
    });
    fakePipeline.failIfAsked("match");
    const { matches, lists: listMatches = {} } = fakePipeline.played();
    const none = { path: null, probability: 1 };
    return {
      fields: Object.fromEntries(fields.map((f) => [f.key, matches[f.key] ?? none])),
      lists: Object.fromEntries(
        lists.map((l) => {
          const { keys, ...array } = listMatches[l.key] ?? { ...none, keys: {} };
          return [
            l.key,
            { ...array, keys: Object.fromEntries(l.fields.map((s) => [s.key, keys[s.key] ?? none])) },
          ];
        }),
      ),
    };
  },
};

export const fakeFiller: Filler = {
  async fill(requests) {
    fakePipeline.calls.push({ step: "fill", fields: requests.map((r) => r.id) });
    fakePipeline.failIfAsked("fill");
    const { fills } = fakePipeline.played();
    return Object.fromEntries(requests.map((r) => [r.id, fills[r.id] ?? null]));
  },
};

export const fakeProposer: Proposer = {
  async propose({ reading }) {
    fakePipeline.calls.push({ step: "propose", reading });
    fakePipeline.failIfAsked("propose");
    return fakePipeline.played().proposal ?? [];
  },
};

export const fakeVerifier: Verifier = {
  async verify(_document, requests) {
    const withSupport = requests.filter((r) => r.pageText !== null);
    fakePipeline.calls.push({
      step: "verify",
      fields: requests.map((r) => r.id),
      supportAskedFor: withSupport.map((r) => r.id),
    });
    fakePipeline.failIfAsked("verify");
    const { verifications = {} } = fakePipeline.played();
    return Object.fromEntries(
      requests.map((r): [string, Verification] => {
        const { fit, support } = verifications[r.id] ?? { fit: 1, support: 1 };
        return [r.id, { fit, support: r.pageText === null ? null : support }];
      }),
    );
  },
};

/**
 * Stands in for outbound HTTP to Integrations (lib/http.ts): records every
 * request and answers from a script, 200 "ok" when nothing is scripted.
 * Install with `vi.mock("./lib/http", …)`.
 */
type HttpAnswer =
  | { status: number; body?: string; retryAfter?: string }
  | { fail: "timeout" | "network" };

export const fakeHttp = {
  requests: [] as Array<{ url: string; headers: Record<string, string>; body: string }>,
  script: [] as HttpAnswer[],
  reset() {
    fakeHttp.requests = [];
    fakeHttp.script = [];
  },
  /** The next requests get these answers, in order. */
  answer(...answers: HttpAnswer[]) {
    fakeHttp.script.push(...answers);
  },
  async post(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; body: string; retryAfter: string | null }> {
    fakeHttp.requests.push({ url, headers, body });
    const next = fakeHttp.script.shift() ?? { status: 200, body: "ok" };
    if ("fail" in next) {
      const { HttpFailure } = await import("./lib/http");
      throw new HttpFailure(next.fail);
    }
    return { status: next.status, body: next.body ?? "", retryAfter: next.retryAfter ?? null };
  },
};

/**
 * What a receiver does with `X-Vink-Signature: t=<unix seconds>,v1=<hex>`:
 * recompute HMAC-SHA256 over `"{t}.{rawBody}"` with the Integration's secret.
 * Returns the signed time, in seconds.
 */
export function expectSignedBy(secret: string, request: { headers: Record<string, string>; body: string }) {
  const header = request.headers["X-Vink-Signature"];
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  expect(match, `not a t=…,v1=… signature: ${header}`).not.toBeNull();
  const [, t, v1] = match!;
  expect(v1).toBe(createHmac("sha256", secret).update(`${t}.${request.body}`).digest("hex"));
  return Number(t);
}
