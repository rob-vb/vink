import { expect, test } from "vitest";
import { organisationFromWelcome, welcomePath } from "./welcome-path";

const BASE = "https://vink.page";

/** What the welcome page receives after a mailed link, as Better Auth handles the callback URL. */
function arrive(path: string, { decodes }: { decodes: number }) {
  // The link carries the path as one query value; the router decodes it once.
  const link = new URL(`${BASE}/api/auth/verify`);
  link.searchParams.set("callbackURL", path);
  let callback = new URL(link.toString()).searchParams.get("callbackURL")!;
  // The magic link then runs decodeURIComponent on it again.
  for (let i = 1; i < decodes; i++) callback = decodeURIComponent(callback);
  const landed = new URL(callback, BASE);
  return organisationFromWelcome(Object.fromEntries(landed.searchParams));
}

const names = ["Bakker Groothandel", "Bakker & Zonen", "Café 100% Puur+", "A/B=C?d#e", "Ørsted Øst", "数据 ✓"];

test("the name survives a verification link, which decodes the callback once", () => {
  for (const name of names) expect(arrive(welcomePath(name), { decodes: 1 })).toBe(name);
});

test("the name survives a magic link, which decodes the callback twice", () => {
  for (const name of names) expect(arrive(welcomePath(name), { decodes: 2 })).toBe(name);
});

test("the old plain-text param broke on a magic link, which is why it changed", () => {
  const old = `/app/welcome?${new URLSearchParams({ organisation: "Bakker & Zonen" })}`;
  expect(arrive(old, { decodes: 2 })).toBe("Bakker");
});

test("links mailed before the change still read the plain-text name", () => {
  expect(organisationFromWelcome({ organisation: " Bakker Groothandel " })).toBe("Bakker Groothandel");
});

test("no name, a blank name or a broken value gives an empty name, so the page asks for one", () => {
  expect(welcomePath("   ")).toBe("/app/welcome");
  expect(organisationFromWelcome({})).toBe("");
  expect(organisationFromWelcome({ org: "!!!" })).toBe("");
  expect(organisationFromWelcome({ org: "_w" })).toBe(""); // not valid UTF-8
  expect(organisationFromWelcome({ org: ["a", "b"] })).toBe("");
});

test("the name is trimmed", () => {
  expect(arrive(welcomePath("  Bakker Groothandel  "), { decodes: 2 })).toBe("Bakker Groothandel");
});
