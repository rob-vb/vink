// Seam 2: runs the real pipeline (Gemini reader and Fill model on Vertex, Jev Match and
// Verify) on fixtures/documents/* and prints the scores. Not run in CI.
//
//   npm run eval                 score, and rewrite each recording.json
//   npm run eval -- --no-record  score only
//   npm run eval -- --threshold 0.85
//   npm run eval -- --readings <dir>  keep each Reading in <dir>, reuse it next time
//   npm run eval -- --fixtures fixtures/timing --no-record  time the 20-page Document
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

// Gemini API list prices (through 2026-12-31; they double on 2027-01-01).
// Vertex EU is billed separately: check them against the Vertex bill after the
// first real run. The Claude prices are for runs through the Claude bridge.
const prices: Prices = {
  "gemini-3.8-flash": { inputPerMillion: 0.75, outputPerMillion: 3.75 },
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-haiku-4-5@20251001": { inputPerMillion: 1, outputPerMillion: 5 },
  // Jev bills input tokens only (ticket 11).
  [models.jev]: { inputPerMillion: 0.042, outputPerMillion: 0 },
};

const args = process.argv.slice(2);
const thresholdAt = args.indexOf("--threshold");
const readingsAt = args.indexOf("--readings");
const fixturesAt = args.indexOf("--fixtures");

async function main() {
  const report = await evaluate({
    fixturesDir: join(process.cwd(), fixturesAt === -1 ? "fixtures" : args[fixturesAt + 1]),
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
