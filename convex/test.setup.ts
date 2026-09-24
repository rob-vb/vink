/// <reference types="vite/client" />
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type {
  FilledValue,
  Filler,
  Match,
  Matcher,
  Reader,
  Reading,
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

/**
 * What the Extraction's Reader, Matcher and Filler answer for one Document:
 * recorded from a real run (see fixtures/), or written by hand.
 */
export type Recording = {
  reading: Reading;
  /** Per Field key; a Field left out is matched to `none`. */
  matches: Record<string, Match>;
  /** Per Field key, what Fill writes from the matched source. */
  fills: Record<string, FilledValue>;
};

/**
 * Stands in for the Extraction's adapters (lib/reader.ts, lib/matcher.ts and
 * lib/filler.ts) by replaying a Recording, and logs every call. Install each
 * fake with `vi.mock`, as for fakePdfStore.
 */
export const fakePipeline = {
  recording: null as Recording | null,
  failing: new Set<"read" | "match" | "fill">(),
  calls: [] as Array<
    | { step: "read" }
    | { step: "match"; reading: Reading; fields: string[] }
    | { step: "fill"; fields: string[] }
  >,
  replay(recording: Recording) {
    fakePipeline.recording = recording;
  },
  /** The next call to that step throws, as an outage would. */
  failOnce(step: "read" | "match" | "fill") {
    fakePipeline.failing.add(step);
  },
  reset() {
    fakePipeline.recording = null;
    fakePipeline.failing.clear();
    fakePipeline.calls = [];
  },
  failIfAsked(step: "read" | "match" | "fill") {
    if (fakePipeline.failing.delete(step)) throw new Error(`${step} is down`);
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
    return fakePipeline.played().reading;
  },
};

export const fakeMatcher: Matcher = {
  async match(reading, fields) {
    fakePipeline.calls.push({ step: "match", reading, fields: fields.map((f) => f.key) });
    fakePipeline.failIfAsked("match");
    const { matches } = fakePipeline.played();
    return Object.fromEntries(
      fields.map((f) => [f.key, matches[f.key] ?? { path: null, probability: 1 }]),
    );
  },
};

export const fakeFiller: Filler = {
  async fill(requests) {
    fakePipeline.calls.push({ step: "fill", fields: requests.map((r) => r.field.key) });
    fakePipeline.failIfAsked("fill");
    const { fills } = fakePipeline.played();
    return Object.fromEntries(requests.map((r) => [r.field.key, fills[r.field.key] ?? null]));
  },
};
