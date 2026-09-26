// Seam 2: runs the real pipeline (Vertex reader and Fill model, Jev Match and
// Verify) on fixtures/documents/* and prints the scores. Not run in CI.
//
//   npm run eval                 score, and rewrite each recording.json
//   npm run eval -- --no-record  score only
//   npm run eval -- --threshold 0.85
//   npm run eval -- --readings <dir>  keep each Reading in <dir>, reuse it next time
//
// Needs GOOGLE_VERTEX_CREDENTIALS and TYPESAFE_API_KEY, e.g. in .env.eval. With
// CLAUDE_BRIDGE_URL (e.g. http://127.0.0.1:3004) and CLAUDE_BRIDGE_SECRET
// instead of Vertex, Claude Code answers the Claude steps (scripts/claude-bridge).
// READER_MODEL, FILL_MODEL and JEV_MODEL try other versions (convex/lib/models.ts).
import { join } from "node:path";
import { filler } from "../../convex/lib/filler";
import { matcher } from "../../convex/lib/matcher";
import { models } from "../../convex/lib/models";
import { reader } from "../../convex/lib/reader";
import { verifier } from "../../convex/lib/verifier";
import { evaluate, type Prices } from "./harness";
import { formatReport } from "./report";

// First-party list prices; Vertex EU is billed separately and may differ.
// Check them against the Vertex bill after the first real run.
const prices: Prices = {
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-haiku-4-5@20251001": { inputPerMillion: 1, outputPerMillion: 5 },
  // Jev bills input tokens only (ticket 11).
  [models.jev]: { inputPerMillion: 0.042, outputPerMillion: 0 },
};

const args = process.argv.slice(2);
const thresholdAt = args.indexOf("--threshold");
const readingsAt = args.indexOf("--readings");

async function main() {
  const report = await evaluate({
    fixturesDir: join(process.cwd(), "fixtures"),
    adapters: { reader, matcher, filler, verifier },
    prices,
    threshold: thresholdAt === -1 ? 0.8 : Number(args[thresholdAt + 1]),
    record: !args.includes("--no-record"),
    readingsDir: readingsAt === -1 ? undefined : args[readingsAt + 1],
  });
  console.log(`Reader ${models.reader}, Fill ${models.filler}, Jev ${models.jev}\n`);
  console.log(formatReport(report));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
