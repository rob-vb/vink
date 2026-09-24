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
