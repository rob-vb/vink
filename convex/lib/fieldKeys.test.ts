import { expect, test } from "vitest";
import { keyFromLabel } from "./fieldKeys";

test("an English label becomes a snake_case key", () => {
  expect(keyFromLabel("VAT number")).toBe("vat_number");
});

test("a label in another language keeps its words, without accents", () => {
  expect(keyFromLabel("Datum van levering")).toBe("datum_van_levering");
  expect(keyFromLabel("Kilométrage relevé")).toBe("kilometrage_releve");
  expect(keyFromLabel("Größe")).toBe("grosse");
});

test("a key always starts with a letter, even when the label doesn't", () => {
  expect(keyFromLabel("2nd driver")).toBe("field_2nd_driver");
  expect(keyFromLabel("日付")).toBe("field");
  expect(keyFromLabel("")).toBe("field");
});

test("a derived key skips keys the Form already uses", () => {
  expect(keyFromLabel("Date", ["date"])).toBe("date_2");
  expect(keyFromLabel("Date", ["date", "date_2"])).toBe("date_3");
  expect(keyFromLabel("Date", ["time"])).toBe("date");
});
