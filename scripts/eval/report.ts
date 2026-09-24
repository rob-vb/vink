// The eval harness's report as printed: per Document, the totals, and the
// verdict against the ADR 0003 bar.
import type { Report } from "./harness";

// ADR 0003: 80 of 84 values right, and every List's entries.
const BAR = 80 / 84;
// A Convex action times out after 10 minutes.
const ACTION_LIMIT_MS = 10 * 60 * 1000;

const ratio = ({ right, total }: { right: number; total: number }) => `${right}/${total}`;
const share = (x: number) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function formatReport({ documents, failures, totals }: Report) {
  const lines: string[] = [];
  for (const d of documents) {
    const { ms, score } = d;
    lines.push(
      `${d.document} (${d.pages} p): values ${ratio(score.values)}, verified ${ratio(score.verifiedValues)}, Lists ${ratio(score.lists)}; ` +
        `$${d.costUsd.toFixed(4)}; ${seconds(ms.total)} (read ${seconds(ms.read)}, match ${seconds(ms.match)}, fill ${seconds(ms.fill)}, verify ${seconds(ms.verify)})` +
        (ms.total > ACTION_LIMIT_MS ? " ⚠ over the 10-minute action limit" : ""),
    );
    for (const m of score.mistakes) {
      lines.push(
        `  WRONG ${m.path}: got ${JSON.stringify(m.got)}, want ${JSON.stringify(m.want)} → ${m.needsReview ? "Needs Review" : "MISSED"}`,
      );
    }
  }
  for (const f of failures) lines.push(`${f.document}: FAILED, ${f.error}`);

  const { values, lists, needsReview } = totals;
  const meetsBar =
    failures.length === 0 && values.right >= BAR * values.total && lists.right === lists.total;
  lines.push(
    "",
    `Values ${ratio(values)}, verified values ${ratio(totals.verifiedValues)}, Lists ${ratio(lists)}`,
    `Needs Review: precision ${share(needsReview.precision)}, recall ${share(needsReview.recall)}`,
    `Cost $${totals.costUsd.toFixed(4)} for ${documents.length} Documents`,
    meetsBar
      ? "Meets the ADR 0003 bar (80/84 values, every List right)."
      : "Below the ADR 0003 bar (80/84 values, every List right, no failures).",
  );
  return lines.join("\n");
}
