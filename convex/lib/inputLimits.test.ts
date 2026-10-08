import { expect, test } from "vitest";
import {
  IMAGE_MIME_TYPES,
  itemCountOf,
  kindOf,
  MAX_EMAIL_ATTACHMENTS,
  MAX_EMAIL_BODY_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  mimeTypeOf,
} from "./inputLimits";

test("a PDF costs its pages", () => {
  expect(itemCountOf({ kind: "pdf", pageCount: 1 })).toBe(1);
  expect(itemCountOf({ kind: "pdf", pageCount: 7 })).toBe(7);
});

test("an image costs 1", () => {
  expect(itemCountOf({ kind: "image" })).toBe(1);
});

test("a newsletter, an email with a body only, costs 1", () => {
  expect(itemCountOf({ kind: "email", body: "Dit is onze nieuwsbrief van oktober.", attachments: [] })).toBe(1);
});

test("a complaint with a photo costs 2: the body and the photo", () => {
  expect(
    itemCountOf({
      kind: "email",
      body: "De bestelling kwam beschadigd aan, zie de foto.",
      attachments: [{ kind: "image" }],
    }),
  ).toBe(2);
});

test("an email with an empty body and 3 PDFs costs the sum of their pages", () => {
  expect(
    itemCountOf({
      kind: "email",
      body: "",
      attachments: [
        { kind: "pdf", pageCount: 2 },
        { kind: "pdf", pageCount: 1 },
        { kind: "pdf", pageCount: 4 },
      ],
    }),
  ).toBe(7);
});

test("a body of only white space is empty", () => {
  expect(
    itemCountOf({ kind: "email", body: " \n\t ", attachments: [{ kind: "pdf", pageCount: 3 }] }),
  ).toBe(3);
});

test("a body with content, a PDF and a photo add up", () => {
  expect(
    itemCountOf({
      kind: "email",
      body: "Factuur en bonnetje in de bijlage.",
      attachments: [{ kind: "pdf", pageCount: 2 }, { kind: "image" }],
    }),
  ).toBe(4);
});

test("an email with no body and no attachments costs nothing", () => {
  expect(itemCountOf({ kind: "email", body: "", attachments: [] })).toBe(0);
});

test("a Document from before kinds is a PDF", () => {
  expect(kindOf({})).toBe("pdf");
  expect(mimeTypeOf({})).toBe("application/pdf");
  expect(kindOf({ kind: "image" })).toBe("image");
  expect(mimeTypeOf({ mimeType: "image/png" })).toBe("image/png");
});

test("the limits are the ones the nginx config and the Worker copy", () => {
  expect(MAX_PDF_BYTES).toBe(10 * 1024 * 1024);
  expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  expect(IMAGE_MIME_TYPES).toContain("image/jpeg");
  expect(IMAGE_MIME_TYPES).toContain("image/png");
  expect(IMAGE_MIME_TYPES).toContain("image/heic");
  expect(MAX_EMAIL_BODY_BYTES).toBe(200 * 1024);
  expect(MAX_EMAIL_ATTACHMENTS).toBe(10);
});
