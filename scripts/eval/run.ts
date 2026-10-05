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
//
// Clef spike: JEV_MODEL=clef (or clef-flash) runs Match and Verify on Clef, which
// needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (and CLOUDFLARE_AI_GATEWAY_ID
// to pay with AI Gateway credits). With --match-images Clef also sees the pages
// in Match (when there are at most 4); with --verify-images it sees them in
// Verify, where support then comes from the images instead of the text layer.
import { join } from "node:path";
import { filler } from "../../convex/lib/filler";
import { matcherWith } from "../../convex/lib/matcher";
import { models } from "../../convex/lib/models";
import { reader } from "../../convex/lib/reader";
import { CLEF_MAX_IMAGES, type PageImage, isClef } from "../../convex/lib/systemOne";
import { verifierWith } from "../../convex/lib/verifier";
import { evaluate, type Prices } from "./harness";
import { renderPages } from "./pageImages";
import { formatReport } from "./report";

// Gemini API list prices (through 2026-12-31; they double on 2027-01-01).
// Vertex EU is billed separately: check them against the Vertex bill after the
// first real run. The Claude prices are for runs through the Claude bridge.
const prices: Prices = {
  "gemini-3.8-flash": { inputPerMillion: 0.75, outputPerMillion: 3.75 },
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-haiku-4-5@20251001": { inputPerMillion: 1, outputPerMillion: 5 },
  // Jev bills input tokens only (ticket 11).
  ...(isClef(models.jev) ? {} : { [models.jev]: { inputPerMillion: 0.042, outputPerMillion: 0 } }),
  // Workers AI list prices (2026-10-03); no output price is listed.
  clef: { inputPerMillion: 0.24, outputPerMillion: 0 },
  "clef-flash": { inputPerMillion: 0.09, outputPerMillion: 0 },
};

const args = process.argv.slice(2);
const thresholdAt = args.indexOf("--threshold");
const readingsAt = args.indexOf("--readings");
const fixturesAt = args.indexOf("--fixtures");
const matchImages = args.includes("--match-images");
const verifyImages = args.includes("--verify-images");

let pages: PageImage[] = [];
const allPages = () => pages;
const matchPages = () => (pages.length <= CLEF_MAX_IMAGES ? pages : []);

async function main() {
  const report = await evaluate({
    fixturesDir: join(process.cwd(), fixturesAt === -1 ? "fixtures" : args[fixturesAt + 1]),
    adapters: {
      reader,
      matcher: matcherWith(matchImages ? matchPages : undefined),
      filler,
      verifier: verifierWith(verifyImages ? allPages : undefined),
    },
    prices,
    threshold: thresholdAt === -1 ? 0.8 : Number(args[thresholdAt + 1]),
    record: !args.includes("--no-record"),
    readingsDir: readingsAt === -1 ? undefined : args[readingsAt + 1],
    beforeDocument: matchImages || verifyImages ? (pdf) => (pages = renderPages(pdf)) : undefined,
  });
  console.log(
    `Reader ${models.reader}, Fill ${models.filler}, Jev ${models.jev}` +
      `${matchImages ? ", Match sees pages" : ""}${verifyImages ? ", Verify sees pages" : ""}\n`,
  );
  console.log(formatReport(report));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
