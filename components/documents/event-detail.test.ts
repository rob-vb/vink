import { expect, test } from "vitest";
import { eventDetailText, splitReasonText } from "./event-detail";
import { englishLabels } from "./labels";
import { dutchLabels } from "./nl-labels";

const noFit = { detail: "Does not fit Werkbon", info: { code: "no_fit", form: "Werkbon" } } as const;

test("a routing event is written in the language of the labels, not in the stored English", () => {
  expect(eventDetailText(noFit, dutchLabels)).toBe("Past niet bij Werkbon");
  expect(eventDetailText(noFit, englishLabels)).toBe("Does not fit Werkbon");
  expect(eventDetailText({ detail: "No Form fits", info: { code: "no_fit" } }, dutchLabels)).toBe("Geen Formulier past");
  expect(eventDetailText({ detail: null, info: { code: "routed", form: "Factuur", percent: 12 } }, dutchLabels)).toBe(
    "Factuur (12%)",
  );
  expect(eventDetailText({ detail: null, info: { code: "nothing_read" } }, dutchLabels)).toBe(
    "Er kon niets worden gelezen",
  );
  expect(eventDetailText({ detail: null, info: { code: "no_forms" } }, englishLabels)).toBe(
    "The Organisation has no Forms",
  );
});

test("Change Form out of No Form names the state in the user's language", () => {
  const info = { code: "form_changed", from: null, to: "Klacht" } as const;
  expect(eventDetailText({ detail: "No Form → Klacht", info }, dutchLabels)).toBe("Geen Formulier → Klacht");
  expect(eventDetailText({ detail: "No Form → Klacht", info }, englishLabels)).toBe("No Form → Klacht");
  expect(
    eventDetailText({ detail: null, info: { code: "form_changed", from: "Werkbon", to: "Klacht" } }, dutchLabels),
  ).toBe("Werkbon → Klacht");
});

test("an older event without a code still shows its stored text", () => {
  expect(eventDetailText({ detail: "Does not fit Werkbon", info: null }, dutchLabels)).toBe("Does not fit Werkbon");
  expect(eventDetailText({ detail: "Blank scan" }, dutchLabels)).toBe("Blank scan");
  expect(eventDetailText({ detail: null, info: null }, dutchLabels)).toBeNull();
});

test("the split reason comes from the code, with the old text as the fallback", () => {
  const split = { answer: "apart", percent: 60, documents: 3 } as const;
  expect(splitReasonText({ split, splitReason: null }, dutchLabels)).toContain("60% zeker van \"aparte papieren\"");
  expect(splitReasonText({ split, splitReason: null }, dutchLabels)).toContain("3 Documenten");
  expect(splitReasonText({ split, splitReason: null }, englishLabels)).toContain("60% sure of \"separate papers\"");
  expect(splitReasonText({ split: null, splitReason: "Vink was not sure …" }, dutchLabels)).toBe("Vink was not sure …");
  expect(splitReasonText({ split: null, splitReason: null }, dutchLabels)).toBeNull();
});
