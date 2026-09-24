import { describe, expect, test } from "vitest";
import { fitType } from "./fieldTypes";
import type { FlatField } from "./pipeline";

const field = (type: "text" | "number" | "date" | "boolean"): FlatField => ({
  type,
  label: "Veld",
  key: "field",
  required: false,
});
const fuelType: FlatField = {
  type: "choice",
  label: "Brandstof",
  key: "fuel",
  required: false,
  options: [{ value: "diesel" }, { value: "petrol" }],
};

describe("a value that fits its Field's type is kept", () => {
  test.each([
    [field("text"), "NWA30E", "NWA30E"],
    [field("number"), 9899, 9899],
    [field("number"), "9899.5", 9899.5],
    [field("date"), "2026-03-01", "2026-03-01"],
    [field("boolean"), false, false],
    [fuelType, "diesel", "diesel"],
    [field("text"), null, null],
  ])("%o with %o", (f, value, expected) => {
    expect(fitType(f, value)).toEqual({ fits: true, value: expected });
  });
});

describe("a value that doesn't fit its Field's type is refused", () => {
  test.each([
    [field("number"), "9.899 km"],
    [field("number"), true],
    [field("date"), "01-03-2026"],
    [field("date"), "2026-02-30"],
    [field("boolean"), "ja"],
    [fuelType, "electric"],
  ])("%o with %o", (f, value) => {
    expect(fitType(f, value)).toEqual({ fits: false });
  });
});
