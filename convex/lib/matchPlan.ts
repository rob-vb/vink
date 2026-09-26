// How Match is asked (spec, Extraction pipeline): one request, or, when the
// Reading and its Choices would push a request past Jev's 64k-token cap, the
// top-level Fields and the List Fields apart, over as many requests as needed.
import type { FlatField, ListField, Reading } from "./pipeline";
import { readingArrays, readingLeaves, readingObjects } from "./reading";

const TOKEN_CAP = 64_000;

// Jev takes at most this many criteria per Choice, `none` included.
export const MAX_CRITERIA = 255;

// Of a Choice's criteria, at most this many are objects (see reading.sourceAt).
export const MAX_OBJECTS = 60;

// Measured on jev-1.13.0 (2026-09-25): the Reading, sent as state, costs
// about a token per character; the criteria about 1.5 to 2 characters per
// token. Both rounded to the cautious side, plus a fixed overhead.
const READING_CHARS_PER_TOKEN = 1;
const CRITERIA_CHARS_PER_TOKEN = 1.5;
const OVERHEAD_TOKENS = 1_000;

const criterion = (text: string) => text.length + 10;

/** A rough upper bound of the tokens each Choice adds: its criteria. */
function choiceTokens(reading: Reading) {
  const leafChars = readingLeaves(reading)
    .slice(0, MAX_CRITERIA)
    // A Field's criteria name the leaves by path; Jev reads the values in the state.
    .reduce((sum, leaf) => sum + criterion(leaf.path), 0) +
    readingObjects(reading)
      .slice(0, MAX_OBJECTS)
      .reduce((sum, object) => sum + criterion(`object ${object.path} ${object.keys.slice(0, 8).join(", ")}`), 0);
  const arrayChars = readingArrays(reading)
    .slice(0, MAX_CRITERIA)
    .reduce((sum, array) => sum + criterion(`${array.path} ${array.keys.join(", ")}`), 0);
  return {
    base: JSON.stringify(reading).length / READING_CHARS_PER_TOKEN + OVERHEAD_TOKENS,
    field: leafChars / CRITERIA_CHARS_PER_TOKEN,
    list: arrayChars / CRITERIA_CHARS_PER_TOKEN,
  };
}

/** Packs items into as few groups as fit under the cap, in order; each group has at least one. */
function pack<T>(items: T[], perItem: number, room: number) {
  const size = Math.max(1, Math.floor(room / perItem));
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/**
 * The Match requests for a Reading: one when it fits under Jev's cap;
 * otherwise top-level Fields and List Fields apart, each spread over as many
 * requests as the cap needs.
 */
export function matchRequests(reading: Reading, fields: FlatField[], lists: ListField[]) {
  const cap = Number(process.env.MATCH_TOKEN_CAP ?? TOKEN_CAP);
  const tokens = choiceTokens(reading);
  const room = cap - tokens.base;
  if (tokens.base + fields.length * tokens.field + lists.length * tokens.list <= cap) {
    return [{ fields, lists }];
  }
  return [
    ...pack(fields, tokens.field, room).map((group) => ({ fields: group, lists: [] as ListField[] })),
    ...pack(lists, tokens.list, room).map((group) => ({ fields: [] as FlatField[], lists: group })),
  ];
}
