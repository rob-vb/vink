import { expect, test } from "vitest";
import type { DocumentResult, Report } from "./harness";
import { formatReport } from "./report";

function documentResult(document: string, right: number, total: number, totalMs: number): DocumentResult {
  return {
    document,
    pages: 3,
    score: {
      values: { right, total },
      verifiedValues: { right: 0, total: 0 },
      lists: { right: 1, total: 1 },
      needsReview: { flagged: 0, wrong: total - right, wrongFlagged: 0 },
      mistakes: [],
    },
    ms: { read: totalMs - 1000, match: 400, fill: 300, verify: 300, total: totalMs },
    costUsd: 0.05,
  };
}

function report(documents: DocumentResult[], failures: Report["failures"] = []): Report {
  const right = documents.reduce((n, d) => n + d.score.values.right, 0);
  const total = documents.reduce((n, d) => n + d.score.values.total, 0);
  return {
    documents,
    failures,
    totals: {
      values: { right, total },
      verifiedValues: { right: 0, total: 0 },
      lists: { right: documents.length, total: documents.length },
      needsReview: { precision: Number.NaN, recall: 0 },
      costUsd: 0.05 * documents.length,
    },
  };
}

test("says whether the run meets the ADR 0003 bar of 80/84 values with every List right", () => {
  expect(formatReport(report([documentResult("a", 40, 42, 90_000), documentResult("b", 40, 42, 90_000)]))).toContain(
    "Meets the ADR 0003 bar",
  );
  expect(formatReport(report([documentResult("a", 39, 42, 90_000), documentResult("b", 40, 42, 90_000)]))).toContain(
    "Below the ADR 0003 bar",
  );
  expect(
    formatReport(report([documentResult("a", 42, 42, 90_000)], [{ document: "b", error: "read is down" }])),
  ).toContain("Below the ADR 0003 bar");
});

test("flags a Document that took longer than the 10-minute action limit", () => {
  const text = formatReport(report([documentResult("slow", 42, 42, 601_000), documentResult("fast", 42, 42, 90_000)]));

  expect(text).toMatch(/slow.*over the 10-minute action limit/);
  expect(text).not.toMatch(/fast.*over the 10-minute action limit/);
});
