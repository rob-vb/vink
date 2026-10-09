import { expect, test } from "vitest";
import { failureCodeOf, failureOf } from "./failure";

test("a stored code reads back as itself", () => {
  expect(failureOf(failureCodeOf(true))).toBe("unreadable");
  expect(failureOf(failureCodeOf(false))).toBe("failed");
});

test("nothing stored means nothing failed", () => {
  expect(failureOf(undefined)).toBeNull();
  expect(failureOf(null)).toBeNull();
  expect(failureOf("")).toBeNull();
});

test("a raw server error from an older row never reaches the user: it reads as a plain failure", () => {
  const raw =
    "Uncaught Error: GOOGLE_VERTEX_CREDENTIALS is not set\n  at handler (../convex/proposalRun.ts:24:16)";
  expect(failureOf(raw)).toBe("failed");
  expect(failureOf("canceled")).toBe("failed");
});
