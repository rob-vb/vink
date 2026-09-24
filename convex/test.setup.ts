/// <reference types="vite/client" />
import workpool from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { PDFDocument } from "pdf-lib";
import { vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type {
  FilledValue,
  Filler,
  Match,
  Matcher,
  PageText,
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
  /** Per Field key; a Field left out is matched to `none`. */
  matches: Record<string, Match>;
  /** Per Field key, what Fill writes from the matched source. */
  fills: Record<string, FilledValue>;
  /**
   * Per Field key, Jev's fit and support; 1 for a Field left out. Support is
   * only answered when it was asked.
   */
  verifications?: Record<string, { fit: number; support: number }>;
};

type Step = "read" | "match" | "fill" | "verify";

/**
 * Stands in for the Extraction's adapters (lib/reader.ts, lib/matcher.ts,
 * lib/filler.ts and lib/verifier.ts) by replaying a Recording, and logs every
 * call. Install each fake with `vi.mock`, as for fakePdfStore.
 */
export const fakePipeline = {
  recording: null as Recording | null,
  failing: new Set<Step>(),
  calls: [] as Array<
    | { step: "read" }
    | { step: "match"; reading: Reading; fields: string[] }
    | { step: "fill"; fields: string[] }
    | { step: "verify"; fields: string[]; supportAskedFor: string[] }
  >,
  replay(recording: Recording) {
    fakePipeline.recording = recording;
  },
  /** The next call to that step throws, as an outage would. */
  failOnce(step: Step) {
    fakePipeline.failing.add(step);
  },
  reset() {
    fakePipeline.recording = null;
    fakePipeline.failing.clear();
    fakePipeline.calls = [];
  },
  failIfAsked(step: Step) {
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
    const { reading, textLayer = [] } = fakePipeline.played();
    return { reading, textLayer };
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

export const fakeVerifier: Verifier = {
  async verify(_document, requests) {
    const withSupport = requests.filter((r) => r.pageText !== null);
    fakePipeline.calls.push({
      step: "verify",
      fields: requests.map((r) => r.field.key),
      supportAskedFor: withSupport.map((r) => r.field.key),
    });
    fakePipeline.failIfAsked("verify");
    const { verifications = {} } = fakePipeline.played();
    return Object.fromEntries(
      requests.map((r): [string, Verification] => {
        const { fit, support } = verifications[r.field.key] ?? { fit: 1, support: 1 };
        return [r.field.key, { fit, support: r.pageText === null ? null : support }];
      }),
    );
  },
};
