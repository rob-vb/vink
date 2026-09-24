// The adapter boundary of an Extraction (ADR 0003). The Reader, Matcher and
// Filler each wrap one outside model; tests replace them with fakes that
// replay recorded responses (see test.setup.ts).
import type { Infer } from "convex/values";
import type { flatField } from "../schema";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * What the vision model says a Document holds, independent of any Form: one
 * object per real-world thing, each with its `_pages` and `_unsure`.
 */
export type Reading = { [key: string]: Json };

export type FlatField = Infer<typeof flatField>;

/** Match's pick for one Field: a leaf path in the Reading, or `null` for `none`. */
export type Match = { path: string | null; probability: number };

export type FilledValue = string | number | boolean | null;

/** The text of one page's text layer. A scanned page has none. */
export type PageText = { page: number; text: string };

export type Reader = {
  /**
   * Reads every page of the PDF into a Reading, and returns the text layer of
   * the pages that have one, for Verify.
   */
  read(pdf: Uint8Array): Promise<{ reading: Reading; textLayer: PageText[] }>;
};

export type Matcher = {
  /** Picks, per Field key, the leaf of the Reading that holds that Field. */
  match(reading: Reading, fields: FlatField[]): Promise<Record<string, Match>>;
};

export type FillRequest = { field: FlatField; source: { path: string; text: string } };

export type Filler = {
  /** Writes, per Field key, the value from that Field's source only. */
  fill(requests: FillRequest[]): Promise<Record<string, FilledValue>>;
};

export type VerifyRequest = {
  field: FlatField;
  value: string | number | boolean;
  readText: string;
  pages: number[];
  /** The text layer of the value's pages; `null` when none has one, so support isn't asked. */
  pageText: string | null;
};

/** Jev's answers for one value: fit, and support when its pages have a text layer. */
export type Verification = { fit: number; support: number | null };

export type Verifier = {
  /** Checks every filled value of one Document, in one request. */
  verify(
    document: { formName: string; formDescription: string | null; reading: Reading },
    requests: VerifyRequest[],
  ): Promise<Record<string, Verification>>;
};
