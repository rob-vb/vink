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

/**
 * What Match can pick as a Field's source: one value, or an object (or
 * array) whose values together hold it, like `removed` with its `brand` and
 * `pattern`. An object's text lists its values as `key: value` lines, and
 * its pages are all of theirs.
 */
export function sourceAt(leaves: Leaf[], path: string): Leaf | undefined {
  const exact = leaves.find((leaf) => leaf.path === path);
  if (exact) return exact;
  const inside = leaves.filter(
    (leaf) => leaf.path.startsWith(`${path}.`) || leaf.path.startsWith(`${path}[`),
  );
  if (inside.length === 0) return undefined;
  return {
    path,
    text: inside
      .map((leaf) => `${leaf.path.slice(path.length).replace(/^\./, "")}: ${leaf.text}`)
      .join("\n"),
    pages: [...new Set(inside.flatMap((leaf) => leaf.pages))].sort((a, b) => a - b),
  };
}

/** An object in a Reading (not the Reading itself) with at least two values, and their keys. */
export type ReadingObject = { path: string; keys: string[] };

/** Every object in a Reading that holds two or more values, depth first; see sourceAt. */
export function readingObjects(reading: Reading): ReadingObject[] {
  const objects: ReadingObject[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (node !== null && typeof node === "object") {
      const keys = readingLeaves(node as Reading).map((leaf) => leaf.path);
      if (path && keys.length >= 2) objects.push({ path, keys });
      for (const [key, value] of Object.entries(node)) {
        if (!key.startsWith("_")) walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(reading, "");
  return objects;
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

/** An array of objects in a Reading: where it is, and the value paths inside its elements. */
export type ReadingArray = { path: string; length: number; keys: string[] };

const isObject = (node: unknown): node is Record<string, unknown> =>
  node !== null && typeof node === "object" && !Array.isArray(node);

/**
 * Every non-empty array of objects in a Reading, depth first, with the paths
 * of the values inside its elements (e.g. `removed.serial`), in first-seen
 * order across elements.
 */
export function readingArrays(reading: Reading): ReadingArray[] {
  const arrays: ReadingArray[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every(isObject)) {
        const keys = new Set<string>();
        for (const item of node) {
          for (const leaf of readingLeaves(item as Reading)) {
            keys.add(leaf.path);
          }
        }
        arrays.push({ path, length: node.length, keys: [...keys] });
      }
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (!key.startsWith("_")) walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(reading, "");
  return arrays;
}

/**
 * The Reading without the values (or arrays) at `paths`, e.g. what a Form
 * already places. An object left with only the Reader's notes goes too.
 */
export function withoutPaths(reading: Reading, paths: string[]): Reading {
  const drop = new Set(paths);
  const prune = (node: unknown, path: string): unknown => {
    if (drop.has(path)) return undefined;
    if (Array.isArray(node)) {
      const items = node.map((item, i) => prune(item, `${path}[${i}]`)).filter((i) => i !== undefined);
      return items.length > 0 ? items : undefined;
    }
    if (isObject(node)) {
      const kept = Object.entries(node).flatMap(([key, value]) => {
        if (key.startsWith("_")) return [[key, value]];
        const pruned = prune(value, path ? `${path}.${key}` : key);
        return pruned === undefined ? [] : [[key, pruned]];
      });
      const hasValues = kept.some(([key]) => !(key as string).startsWith("_"));
      return hasValues || path === "" ? Object.fromEntries(kept) : undefined;
    }
    return node;
  };
  return prune(reading, "") as Reading;
}
