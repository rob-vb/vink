// How Match is asked (spec, Extraction pipeline): one request, or, when the
// Reading would push a request past Jev's 64k-token cap, one request for the
// top-level Fields and one for the List Fields.
import type { FlatField, ListField, Reading } from "./pipeline";
import { readingArrays, readingLeaves } from "./reading";

const TOKEN_CAP = 64_000;

// Jev takes at most this many criteria per Choice, `none` included.
export const MAX_CRITERIA = 255;

// A cautious characters-per-token for JSON full of numbers and codes.
const CHARS_PER_TOKEN = 3;

/** A rough upper bound of a Match request's tokens: the Reading plus every Choice's criteria. */
function estimateTokens(reading: Reading, fields: FlatField[], lists: ListField[]) {
  const criterion = (path: string, text: string) => path.length + text.length + 10;
  const leafCriteria = readingLeaves(reading)
    .slice(0, MAX_CRITERIA)
    .reduce((sum, leaf) => sum + criterion(leaf.path, leaf.text), 0);
  const arrayCriteria = readingArrays(reading)
    .slice(0, MAX_CRITERIA)
    .reduce((sum, array) => sum + criterion(array.path, array.keys.join(", ")), 0);
  const chars =
    JSON.stringify(reading).length +
    fields.length * leafCriteria +
    lists.length * arrayCriteria;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** The Match requests for a Reading: one, or two when one would pass the cap. */
export function matchRequests(reading: Reading, fields: FlatField[], lists: ListField[]) {
  const cap = Number(process.env.MATCH_TOKEN_CAP ?? TOKEN_CAP);
  if (fields.length === 0 || lists.length === 0 || estimateTokens(reading, fields, lists) <= cap) {
    return [{ fields, lists }];
  }
  return [
    { fields, lists: [] },
    { fields: [], lists },
  ];
}
