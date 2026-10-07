// The adapter boundary of an Extraction (ADR 0003). The Reader, Matcher and
// Filler each wrap one outside model; tests replace them with fakes that
// replay recorded responses (see test.setup.ts).
import type { Infer } from "convex/values";
import type { field, flatField } from "../schema";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * What the vision model says a Document holds, independent of any Form: one
 * object per real-world thing, each with its `_pages` and `_unsure`.
 */
export type Reading = { [key: string]: Json };

export type FlatField = Infer<typeof flatField>;
export type ListField = Extract<Infer<typeof field>, { type: "list" }>;

/**
 * Match's pick for one Field: a leaf path in the Reading, or `null` for
 * `none`. Its alternatives are the other sources Jev gave some probability,
 * which may give the same value (the same total on two papers).
 */
export type Match = {
  path: string | null;
  probability: number;
  alternatives?: Array<{ path: string | null; probability: number }>;
};

/**
 * Match's pick for a List Field: an array of objects in the Reading (or `null`
 * for `none`), and per sub-Field key a path inside its elements.
 */
export type ListMatch = Match & { keys: Record<string, Match> };

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
  /**
   * Picks, per top-level Field key, the leaf of the Reading that holds it, and
   * per List Field key, the array that holds its entries.
   */
  match(
    reading: Reading,
    request: { fields: FlatField[]; lists: ListField[] },
  ): Promise<{ fields: Record<string, Match>; lists: Record<string, ListMatch> }>;
};

/**
 * One value to fill. Its id is the Field key, or for a sub-Field of a List
 * entry `list[entry].key`, e.g. `lines[0].quantity`.
 */
export type FillRequest = { id: string; field: FlatField; source: { path: string; text: string } };

export type Filler = {
  /** Writes, per request id, the value from that request's source only. */
  fill(requests: FillRequest[]): Promise<Record<string, FilledValue>>;
};

export type VerifyRequest = {
  /** As in FillRequest. */
  id: string;
  field: FlatField;
  /** The Field as a user knows it, e.g. `Invoice lines → Amount`. */
  label: string;
  value: string | number | boolean;
  readText: string;
  pages: number[];
  /** The text layer of the value's pages; `null` when none has one, so support isn't asked. */
  pageText: string | null;
};

/** Jev's answers for one value: fit, and support when its pages have a text layer. */
export type Verification = { fit: number; support: number | null };

export type Verifier = {
  /** Checks every filled value of one Document, in one request; answers per request id. */
  verify(
    document: { formName: string; formDescription: string | null; reading: Reading },
    requests: VerifyRequest[],
  ): Promise<Record<string, Verification>>;
};

/** One Field a Form Proposal suggests, and whether it serves the document's purpose. */
export type ProposedField = { field: Infer<typeof field>; ticked: boolean };

export type Proposer = {
  /**
   * Proposes a Form's Fields from a sample: its PDF (page images and text
   * layer) and its Reading, which lists everything on it.
   */
  propose(
    sample: { pdf: Uint8Array; reading: Reading; textLayer: PageText[] },
  ): Promise<ProposedField[]>;
};
