import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A `<word>` in a message is a rich-text tag, so a literal like `Bearer <key>`
// breaks the message at runtime. The Dutch and English text of one message
// must therefore use the same tags: a stray placeholder shows up as a mismatch.
const root = join(process.cwd(), "messages");

function flatten(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, [...path, key]));
}

function load(locale: string) {
  return new Map(
    readdirSync(join(root, locale)).flatMap((file) =>
      flatten(JSON.parse(readFileSync(join(root, locale, file), "utf8")), [file]),
    ),
  );
}

const tagsOf = (text: string) => [...text.matchAll(/<([a-zA-Z][\w-]*)>/g)].map((m) => m[1]).sort();

describe("messages", () => {
  const nl = load("nl");
  const en = load("en");

  it("use the same rich-text tags in Dutch and English", () => {
    const mismatches = [...nl]
      .filter(([key, text]) => en.has(key) && tagsOf(text).join() !== tagsOf(en.get(key)!).join())
      .map(([key]) => key);
    expect(mismatches).toEqual([]);
  });

  it("close every rich-text tag they open", () => {
    const unclosed = [...nl, ...en]
      .filter(([, text]) => tagsOf(text).some((tag) => !text.includes(`</${tag}>`)))
      .map(([key]) => key);
    expect(unclosed).toEqual([]);
  });
});
