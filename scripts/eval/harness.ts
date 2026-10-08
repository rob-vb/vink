// The fixture eval harness (spec, Seam 2): runs the pipeline on every
// fixtures/documents/* Document and scores it against its expected.json.
// run.ts runs it with the real adapters; tests run it with the Seam 1 fakes.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { extract } from "../../convex/lib/extract";
import type {
  EmailAttachment,
  Filler,
  FlatField,
  ListField,
  Matcher,
  Reader,
  ReaderInput,
  Verifier,
} from "../../convex/lib/pipeline";
import { type Usage, usage } from "../../convex/lib/usage";
import type { Recording } from "../../convex/test.setup";
import { type Expected, type FixtureForm, scoreFixture } from "./score";

export type Adapters = { reader: Reader; matcher: Matcher; filler: Filler; verifier: Verifier };

/** Dollars per million tokens, per model id. */
export type Prices = Record<string, { inputPerMillion: number; outputPerMillion: number }>;

type Step = "read" | "match" | "fill" | "verify";

export type DocumentResult = {
  document: string;
  /** A PDF's pages; 1 for an image or an email (its Items, bar attachments). */
  pages: number;
  score: ReturnType<typeof scoreFixture>;
  /** Wall-clock time per step, and for the whole Document. */
  ms: Record<Step | "total", number>;
  costUsd: number;
};

export type Report = Awaited<ReturnType<typeof evaluate>>;

/** The fixture Form as an app Form: its field names become keys and labels. */
function formFields(form: FixtureForm) {
  const type = (t: "string" | "number" | "date") => (t === "string" ? ("text" as const) : t);
  const flat = (f: { name: string; type: "string" | "number" | "date"; description?: string }) =>
    ({
      type: type(f.type),
      key: f.name,
      label: f.name,
      required: false,
      ...(f.description ? { description: f.description } : {}),
    }) as FlatField;
  return {
    fields: form.fields.flatMap((f) => (f.type === "list" ? [] : [flat(f)])),
    lists: form.fields.flatMap((f) =>
      f.type === "list"
        ? [{ type: "list", key: f.name, label: f.name, required: false, fields: f.fields.map(flat) } as ListField]
        : [],
    ),
  };
}

function costOf(entries: Usage[], prices: Prices) {
  return entries.reduce((sum, { model, inputTokens, outputTokens }) => {
    const price = prices[model];
    if (!price) throw new Error(`No price for ${model}; add it to the eval prices`);
    return sum + (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1e6;
  }, 0);
}

const json = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".heic": "image/heic",
};

/**
 * A minimal plain-text .eml: the headers Subject, From and Date, a blank line,
 * then the body as UTF-8 text. Multipart and encoded mails are refused: put
 * the attachments in the fixture's `attachments/` folder instead.
 */
export function parseEml(eml: string): Omit<Extract<ReaderInput, { kind: "email" }>, "kind" | "attachments"> {
  const [head, ...rest] = eml.replace(/\r\n/g, "\n").split("\n\n");
  const headers = new Map<string, string>();
  for (const line of head.replace(/\n[ \t]+/g, " ").split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim());
  }
  const contentType = headers.get("content-type") ?? "text/plain";
  const encoding = (headers.get("content-transfer-encoding") ?? "7bit").toLowerCase();
  if (!contentType.toLowerCase().startsWith("text/plain") || !["7bit", "8bit"].includes(encoding)) {
    throw new Error(`Only a plain-text, 7bit or 8bit .eml is supported (got ${contentType}, ${encoding})`);
  }
  const need = (name: string) => {
    const value = headers.get(name);
    if (value === undefined) throw new Error(`The .eml has no ${name} header`);
    return value;
  };
  return { subject: need("subject"), from: need("from"), date: need("date"), body: rest.join("\n\n").trim() };
}

/**
 * The Reader's input for a fixture Document, by the file it holds:
 * document.pdf, document.jpg|jpeg|png|heic, or document.eml (with its
 * attachments, if any, in attachments/).
 */
export function loadInput(dir: string, pages: number): ReaderInput {
  const bytesOf = (path: string) => new Uint8Array(readFileSync(path));
  const file = readdirSync(dir).find((name) => /^document\.[a-z]+$/.test(name));
  if (file === undefined) throw new Error(`No document.pdf, image or .eml in ${dir}`);
  const extension = extname(file).toLowerCase();
  if (extension === ".pdf") return { kind: "pdf", bytes: bytesOf(join(dir, file)), pageCount: pages };
  if (IMAGE_TYPES[extension]) {
    return { kind: "image", bytes: bytesOf(join(dir, file)), mimeType: IMAGE_TYPES[extension] };
  }
  if (extension === ".eml") {
    const attachmentsDir = join(dir, "attachments");
    const attachments: EmailAttachment[] = existsSync(attachmentsDir)
      ? readdirSync(attachmentsDir)
          .sort()
          .map((filename) => {
            const mimeType = extname(filename).toLowerCase() === ".pdf" ? "application/pdf" : IMAGE_TYPES[extname(filename).toLowerCase()];
            if (!mimeType) throw new Error(`Attachment ${filename} is not a PDF or an image`);
            return { filename, mimeType, bytes: bytesOf(join(attachmentsDir, filename)) };
          })
      : [];
    return { kind: "email", ...parseEml(readFileSync(join(dir, file), "utf8")), attachments };
  }
  throw new Error(`Unknown fixture file ${file}`);
}

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** What the stored Reading is keyed by: the file's hash (as before for a PDF); an email's text and attachments' hashes. */
function fingerprint(input: ReaderInput) {
  if (input.kind !== "email") return sha256(input.bytes);
  const { subject, from, date, body, attachments } = input;
  return sha256(
    JSON.stringify({ subject, from, date, body, attachments: attachments.map((a) => [a.filename, sha256(a.bytes)]) }),
  );
}

/**
 * The Reader, but each Document's Reading is kept in `dir` (by the input's
 * sha256) and reused after the first read, so Match and Fill changes can be
 * compared on the same Readings: Read differs from run to run.
 */
function storedReadings(reader: Reader, dir: string): Reader {
  return {
    async read(input) {
      const file = join(dir, `${fingerprint(input)}.json`);
      if (existsSync(file)) return json<Awaited<ReturnType<Reader["read"]>>>(file);
      const read = await reader.read(input);
      writeFileSync(file, JSON.stringify(read));
      return read;
    },
  };
}

export async function evaluate({
  fixturesDir,
  adapters,
  prices,
  threshold,
  record = false,
  readingsDir,
}: {
  fixturesDir: string;
  adapters: Adapters;
  prices: Prices;
  threshold: number;
  /**
   * Writes each Document's answers to its recording.json, for the Seam 1 fakes
   * to replay, and the result to its extracted.json.
   */
  record?: boolean;
  /** Keeps each Document's Reading here and reuses it on later runs; see storedReadings. */
  readingsDir?: string;
}) {
  const reader = readingsDir ? storedReadings(adapters.reader, readingsDir) : adapters.reader;
  const documents: DocumentResult[] = [];
  const failures: Array<{ document: string; error: string }> = [];
  const fixtures = readdirSync(join(fixturesDir, "documents"))
    .filter((name) => existsSync(join(fixturesDir, "documents", name, "expected.json")))
    .sort();
  for (const document of fixtures) {
    const dir = join(fixturesDir, "documents", document);
    const expected = json<Expected & { pages: number }>(join(dir, "expected.json"));
    const form = json<FixtureForm>(join(fixturesDir, "forms", `${expected.form}.json`));

    const used: Usage[] = [];
    usage.listener = (entry) => used.push(entry);
    const ms: Record<Step | "total", number> = { read: 0, match: 0, fill: 0, verify: 0, total: 0 };
    const timed = <A extends unknown[], R>(step: Step, call: (...args: A) => Promise<R>) =>
      async (...args: A) => {
        const start = performance.now();
        try {
          return await call(...args);
        } finally {
          ms[step] += performance.now() - start;
        }
      };

    const start = performance.now();
    try {
      const input = loadInput(dir, expected.pages);
      const { reading, textLayer } = await timed("read", reader.read)(input);
      const recording: Required<Omit<Recording, "proposal" | "route">> = {
        reading,
        textLayer,
        matches: {},
        lists: {},
        fills: {},
        verifications: {},
      };
      const extracted = await extract(
        {
          reading,
          textLayer,
          formName: form.name,
          formDescription: form.description ?? null,
          ...formFields(form),
        },
        {
          matcher: {
            match: timed("match", async (...args: Parameters<Matcher["match"]>) => {
              const answer = await adapters.matcher.match(...args);
              Object.assign(recording.matches, answer.fields);
              Object.assign(recording.lists, answer.lists);
              return answer;
            }),
          },
          filler: {
            fill: timed("fill", async (...args: Parameters<Filler["fill"]>) =>
              Object.assign(recording.fills, await adapters.filler.fill(...args)),
            ),
          },
          verifier: {
            verify: timed("verify", async (...args: Parameters<Verifier["verify"]>) => {
              const answer = await adapters.verifier.verify(...args);
              for (const [id, { fit, support }] of Object.entries(answer)) {
                // Support is only replayed where it is asked, so 1 stands in for "not asked".
                recording.verifications[id] = { fit, support: support ?? 1 };
              }
              return answer;
            }),
          },
        },
      );
      if (record) {
        writeFileSync(join(dir, "recording.json"), `${JSON.stringify(recording, null, 2)}\n`);
        // What the pipeline made of it, for the replay test to hold the app to.
        writeFileSync(join(dir, "extracted.json"), `${JSON.stringify(extracted, null, 2)}\n`);
      }
      ms.total = performance.now() - start;
      documents.push({
        document,
        pages: expected.pages,
        score: scoreFixture({ form, expected, extracted, threshold }),
        ms,
        costUsd: costOf(used, prices),
      });
    } catch (error) {
      failures.push({ document, error: error instanceof Error ? error.message : String(error) });
    } finally {
      usage.listener = null;
    }
  }

  const sum = (pick: (d: DocumentResult["score"]) => { right: number; total: number }) =>
    documents.reduce(
      (acc, d) => ({ right: acc.right + pick(d.score).right, total: acc.total + pick(d.score).total }),
      { right: 0, total: 0 },
    );
  const count = (key: "flagged" | "wrong" | "wrongFlagged") =>
    documents.reduce((n, d) => n + d.score.needsReview[key], 0);
  return {
    documents,
    failures,
    totals: {
      values: sum((s) => s.values),
      verifiedValues: sum((s) => s.verifiedValues),
      lists: sum((s) => s.lists),
      needsReview: {
        precision: count("wrongFlagged") / count("flagged"),
        recall: count("wrongFlagged") / count("wrong"),
      },
      costUsd: documents.reduce((n, d) => n + d.costUsd, 0),
    },
  };
}
