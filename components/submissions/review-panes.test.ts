import { describe, expect, it } from "vitest";
import {
  emailPageCount,
  findSource,
  firstPageOf,
  highlightSegments,
  isHeic,
  locatePage,
  pagesOf,
  paneFor,
  type AttachmentInfo,
} from "./review-panes";

describe("paneFor", () => {
  it("picks the pane by kind", () => {
    expect(paneFor("pdf")).toBe("pdf");
    expect(paneFor("email")).toBe("email");
    expect(paneFor("image")).toBe("image");
  });

  it("treats a missing or unknown kind as a PDF", () => {
    expect(paneFor(undefined)).toBe("pdf");
    expect(paneFor(null)).toBe("pdf");
    expect(paneFor("fax")).toBe("pdf");
  });
});

describe("isHeic", () => {
  it("knows both names of HEIC and nothing else", () => {
    expect(isHeic("image/heic")).toBe(true);
    expect(isHeic("image/HEIF")).toBe(true);
    expect(isHeic("image/jpeg")).toBe(false);
  });
});

const pdf3: AttachmentInfo = { filename: "a.pdf", mimeType: "application/pdf", pageCount: 3 };
const photo: AttachmentInfo = { filename: "b.jpg", mimeType: "image/jpeg" };
const pdf2: AttachmentInfo = { filename: "c.pdf", mimeType: "application/pdf", pageCount: 2 };

describe("email pages", () => {
  const attachments = [pdf3, photo, pdf2];

  it("counts a PDF's pages, an image as one, and an unknown PDF as one", () => {
    expect(pagesOf(pdf3)).toBe(3);
    expect(pagesOf(photo)).toBe(1);
    expect(pagesOf({ filename: "old.pdf", mimeType: "application/pdf" })).toBe(1);
    expect(emailPageCount(attachments)).toBe(1 + 3 + 1 + 2);
  });

  it("points page 1 at the body and later pages at the attachments, in order", () => {
    expect(locatePage(attachments, 1)).toEqual({ part: "body" });
    expect(locatePage(attachments, 2)).toEqual({ part: "attachment", index: 0, page: 1 });
    expect(locatePage(attachments, 4)).toEqual({ part: "attachment", index: 0, page: 3 });
    expect(locatePage(attachments, 5)).toEqual({ part: "attachment", index: 1, page: 1 });
    expect(locatePage(attachments, 6)).toEqual({ part: "attachment", index: 2, page: 1 });
    expect(locatePage(attachments, 7)).toEqual({ part: "attachment", index: 2, page: 2 });
  });

  it("points a page past the end at the last page, and any page of a mail without attachments at the body", () => {
    expect(locatePage(attachments, 99)).toEqual({ part: "attachment", index: 2, page: 2 });
    expect(locatePage([], 3)).toEqual({ part: "body" });
    expect(locatePage(attachments, 0)).toEqual({ part: "body" });
  });

  it("finds the first page of an attachment", () => {
    expect(firstPageOf(attachments, 0)).toBe(2);
    expect(firstPageOf(attachments, 1)).toBe(5);
    expect(firstPageOf(attachments, 2)).toBe(6);
    for (const [index] of attachments.entries()) {
      expect(locatePage(attachments, firstPageOf(attachments, index))).toMatchObject({ index, page: 1 });
    }
  });
});

describe("source highlighting in the email body", () => {
  const body = "Hello,\n\nThe coffee machine on the 2nd floor\nmakes a noise since Monday 28 September.\nCall Anouk Visser on 06 1234 5678.";

  it("finds the text a value was read from", () => {
    const range = findSource(body, "Anouk Visser")!;
    expect(body.slice(range.start, range.end)).toBe("Anouk Visser");
  });

  it("ignores case and differences in whitespace, such as a line break", () => {
    const range = findSource(body, "the 2nd floor makes a NOISE")!;
    expect(body.slice(range.start, range.end)).toBe("the 2nd floor\nmakes a noise");
  });

  it("takes the first occurrence", () => {
    expect(findSource("a 12 b 12", "12")).toEqual({ start: 2, end: 4 });
  });

  it("reads regex characters as plain text", () => {
    const range = findSource("Total (excl. VAT) 1.240,00 + 21%", "1.240,00 + 21%")!;
    expect(range).toEqual({ start: 18, end: 32 });
    expect(findSource("1x240", "1.240")).toBeNull();
  });

  it("finds nothing for empty, missing or absent text", () => {
    expect(findSource(body, null)).toBeNull();
    expect(findSource(body, undefined)).toBeNull();
    expect(findSource(body, "   ")).toBeNull();
    expect(findSource(body, "not in the mail")).toBeNull();
    expect(findSource("", "x")).toBeNull();
  });

  it("splits the body into pieces that add up to it, with the source marked", () => {
    const segments = highlightSegments(body, "06 1234 5678");
    expect(segments.map((s) => s.text).join("")).toBe(body);
    expect(segments.filter((s) => s.mark).map((s) => s.text)).toEqual(["06 1234 5678"]);
  });

  it("leaves the body whole when there is nothing to mark, or the source is at an edge", () => {
    expect(highlightSegments(body, null)).toEqual([{ text: body, mark: false }]);
    expect(highlightSegments("abc", "abc")).toEqual([{ text: "abc", mark: true }]);
    expect(highlightSegments("", null)).toEqual([{ text: "", mark: false }]);
  });
});
