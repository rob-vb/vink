import type { Reading } from "./pipeline";

/** A value in a Reading, where it sits and the pages it was read on. */
export type Leaf = { path: string; text: string; pages: number[] };

/**
 * Every value in a Reading, depth first, with a path like
 * `tyreChanges[0].removed.serial`. Keys starting with `_` are the Reader's
 * notes, not values. A value's pages are those of the nearest object that
 * lists `_pages`.
 */
export function readingLeaves(reading: Reading): Leaf[] {
  const leaves: Leaf[] = [];
  const walk = (node: unknown, path: string, pages: number[]) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, pages));
    } else if (node !== null && typeof node === "object") {
      const own = (node as { _pages?: unknown })._pages;
      const here = Array.isArray(own) ? own.filter((p) => typeof p === "number") : pages;
      for (const [key, value] of Object.entries(node)) {
        if (!key.startsWith("_")) walk(value, path ? `${path}.${key}` : key, here);
      }
    } else if (node !== null && node !== "") {
      leaves.push({ path, text: String(node), pages });
    }
  };
  walk(reading, "", []);
  return leaves;
}

type Segment = string | number;

/** `tyreChanges[0].removed.serial` → `["tyreChanges", 0, "removed", "serial"]`. */
function segmentsOf(path: string): Segment[] {
  return [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) =>
    m[2] === undefined ? m[1] : Number(m[2]),
  );
}

function pathOf(segments: Segment[]) {
  return segments
    .map((s, i) => (typeof s === "number" ? `[${s}]` : i === 0 ? s : `.${s}`))
    .join("");
}

/** The objects on the way to a leaf, each with the rest of the path from it. */
function ancestors(reading: Reading, path: string) {
  const segments = segmentsOf(path);
  const found: Array<{ node: Record<string, unknown>; rest: Segment[] }> = [];
  let node: unknown = reading;
  for (let i = 0; i < segments.length; i++) {
    if (node === null || typeof node !== "object") break;
    if (!Array.isArray(node)) {
      found.push({ node: node as Record<string, unknown>, rest: segments.slice(i) });
    }
    node = (node as Record<Segment, unknown>)[segments[i]];
  }
  return found;
}

/** Whether the Reader listed this value in an `_unsure` of any object around it. */
export function isUnsure(reading: Reading, path: string) {
  return ancestors(reading, path).some(({ node, rest }) => {
    const unsure = node._unsure;
    return Array.isArray(unsure) && unsure.includes(pathOf(rest));
  });
}

/** `licensePlate` → `license plate`. */
function wordsOf(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * Whether the Reader kept conflicting readings of this value: an `…Alt`
 * sibling on the way to it (`position` and `positionAlt`), or a `conflicts`
 * note around it that names it.
 */
export function isConflicting(reading: Reading, path: string) {
  const key = segmentsOf(path).findLast((s) => typeof s === "string");
  return ancestors(reading, path).some(({ node, rest }) => {
    const [next] = rest;
    if (typeof next === "string") {
      const alternative = next.endsWith("Alt") ? next.slice(0, -3) : `${next}Alt`;
      if (alternative in node) return true;
    }
    const note = node.conflicts;
    if (typeof note !== "string" || key === undefined) return false;
    const text = note.toLowerCase();
    return text.includes(key.toLowerCase()) || text.includes(wordsOf(key));
  });
}
