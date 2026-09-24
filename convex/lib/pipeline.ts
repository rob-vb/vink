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

export type Reader = {
  /** Reads every page of the PDF into a Reading. */
  read(pdf: Uint8Array): Promise<Reading>;
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
