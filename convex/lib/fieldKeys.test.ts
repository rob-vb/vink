import { expect, test } from "vitest";
import { keyFromLabel } from "./fieldKeys";

test("an English label becomes a camelCase key", () => {
  expect(keyFromLabel("VAT number")).toBe("vatNumber");
});

test("a label in another language keeps its words, without accents", () => {
  expect(keyFromLabel("Datum van levering")).toBe("datumVanLevering");
  expect(keyFromLabel("Kilométrage relevé")).toBe("kilometrageReleve");
  expect(keyFromLabel("Größe")).toBe("grosse");
});

test("a key always starts with a letter, even when the label doesn't", () => {
  expect(keyFromLabel("2nd driver")).toBe("field2ndDriver");
  expect(keyFromLabel("日付")).toBe("field");
  expect(keyFromLabel("")).toBe("field");
});

test("a derived key skips keys the Form already uses", () => {
  expect(keyFromLabel("Date", ["date"])).toBe("date2");
  expect(keyFromLabel("Date", ["date", "date2"])).toBe("date3");
  expect(keyFromLabel("Date", ["time"])).toBe("date");
});
