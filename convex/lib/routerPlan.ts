// How the Router is asked (ADR 0010): the Reading as Jev's state and each
// Form as a criterion, kept under Jev's token cap like Match (lib/matchPlan.ts).
// When the full request is too big, the Reading and the criteria are cut in
// steps; when even the smallest does not fit, there is no request, and the
// Document goes to No Form instead of failing.
import { criterionChars, estimateTokens, MAX_ROUTABLE_FORMS, tokenCap } from "./matchPlan";
import type { Reading, RoutableForm } from "./pipeline";

type Json = Reading[string];

export const NONE_CRITERION = "None of these Forms is made for this document";

export const ROUTER_QUESTION =
  "Which Form is the document in `document` made for? Pick a Form only when this kind of document is what the Form collects; otherwise pick none.";

/** How much of the Reading and of each Form a request keeps. `leaves: null` is the whole Reading. */
type Level = { leaves: number | null; valueChars: number; description: number; fields: number };

// From the full request to the smallest that is still worth asking.
const LEVELS: Level[] = [
  { leaves: null, valueChars: Infinity, description: 300, fields: 30 },
  { leaves: 200, valueChars: 300, description: 300, fields: 30 },
  { leaves: 60, valueChars: 150, description: 100, fields: 10 },
  { leaves: 20, valueChars: 100, description: 0, fields: 5 },
];

function criterion(form: RoutableForm, level: Level) {
  const description = form.description && level.description > 0 ? `: ${form.description.slice(0, level.description)}` : "";
  const fields = form.fields.slice(0, level.fields).join(", ");
  return `Form "${form.name}"${description}. Fields: ${fields}${form.fields.length > level.fields ? ", …" : ""}`;
}

type Budget = { left: number };

/** A copy of a Reading's values, at most `budget.left` of them, each cut to `valueChars`; the Reader's `_` notes are left out. */
function prune(node: Json, budget: Budget, valueChars: number): Json | undefined {
  if (Array.isArray(node)) {
    const items = node.flatMap((item) => {
      const kept = prune(item, budget, valueChars);
      return kept === undefined ? [] : [kept];
    });
    return items.length > 0 ? items : undefined;
  }
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node).flatMap(([key, value]) => {
      if (key.startsWith("_")) return [];
      const kept = prune(value, budget, valueChars);
      return kept === undefined ? [] : [[key, kept] as const];
    });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  if (node === null || node === "" || budget.left <= 0) return undefined;
  budget.left--;
  return String(node).slice(0, valueChars);
}

/**
 * The Reading cut to about `leaves` values, shared evenly between its
 * top-level keys so that every part of the document is still seen; the keys
 * that lost all their values are named.
 */
export function shortReading(reading: Reading, leaves: number, valueChars: number): Json {
  const keys = Object.keys(reading).filter((key) => !key.startsWith("_"));
  const share = Math.max(1, Math.floor(leaves / Math.max(1, keys.length)));
  const kept: Record<string, Json> = {};
  const omitted: string[] = [];
  for (const key of keys) {
    const value = prune(reading[key], { left: share }, valueChars);
    if (value === undefined) omitted.push(key);
    else kept[key] = value;
  }
  return omitted.length > 0 ? { ...kept, "…": `more, not shown: ${omitted.slice(0, 50).join(", ")}` } : kept;
}

/**
 * The request for the Router, or `null` when no cut of it fits under Jev's
 * cap. `criteria` keys are `none` and `f<i>`, i being the Form's place in
 * `forms` (at most MAX_ROUTABLE_FORMS of them are offered).
 */
export function routerRequest(reading: Reading, forms: RoutableForm[]) {
  const listed = forms.slice(0, MAX_ROUTABLE_FORMS);
  const cap = tokenCap();
  for (const level of LEVELS) {
    const document = level.leaves === null ? reading : shortReading(reading, level.leaves, level.valueChars);
    const state = { document };
    const criteria: Record<string, string> = {
      none: NONE_CRITERION,
      ...Object.fromEntries(listed.map((form, i) => [`f${i}`, criterion(form, level)])),
    };
    const criteriaChars =
      Object.values(criteria).reduce((sum, text) => sum + criterionChars(text), 0) + ROUTER_QUESTION.length;
    if (estimateTokens(JSON.stringify(state).length, criteriaChars) <= cap) {
      return { state, criteria, listed };
    }
  }
  return null;
}
