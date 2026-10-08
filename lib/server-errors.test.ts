import { expect, test } from "vitest";
import { DESCRIPTION_EMPTY, DESCRIPTION_TOO_LONG } from "@/convex/lib/formDescription";
import { serverErrorText } from "./server-errors";

test("translates a fixed message and a code", () => {
  expect(serverErrorText("A Form needs a name", "nl")).toBe("Een Formulier heeft een naam nodig");
  expect(serverErrorText("LastAdmin", "nl")).toBe("Een Organisatie heeft minstens één Admin nodig.");
});

test("translates the size refusal every way in gives", () => {
  expect(serverErrorText("The PDF is larger than 10 MB.", "nl")).toBe("De pdf is groter dan 10 MB.");
});

test("translates the refusals of a described Form", () => {
  expect(serverErrorText(DESCRIPTION_EMPTY, "nl")).not.toBe(DESCRIPTION_EMPTY);
  expect(serverErrorText(DESCRIPTION_TOO_LONG, "nl")).not.toBe(DESCRIPTION_TOO_LONG);
});

test("translates a message with values in it", () => {
  expect(serverErrorText("3 values still need review", "nl")).toBe(
    "3 waarden moeten nog gecontroleerd worden",
  );
  expect(serverErrorText("Amount needs a number", "nl")).toBe("Amount moet een getal zijn");
  expect(serverErrorText('The key "total" is used by more than one sub-Field of the List Field "lines"', "nl")).toBe(
    'De sleutel "total" wordt door meer dan één subveld van de Lijst "lines" gebruikt',
  );
  expect(serverErrorText("Total is required: add an entry first", "nl")).toBe(
    "Total is verplicht: voeg eerst een regel toe",
  );
});

test("shows an unknown message as it is", () => {
  expect(serverErrorText("Something new went wrong", "nl")).toBe("Something new went wrong");
  expect(serverErrorText("toString", "nl")).toBe("toString");
});

test("leaves English alone", () => {
  expect(serverErrorText("A Form needs a name", "en")).toBe("A Form needs a name");
});
