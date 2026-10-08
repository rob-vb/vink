import { expect, test } from "vitest";
import { failsDmarc, planEmail, tokenOf } from "./map";

const pdf = new TextEncoder().encode("%PDF-1.7 …");

test("each PDF is stored under its own key; everything else is listed as skipped", () => {
  let n = 0;
  const plan = planEmail(
    {
      to: "K3y9ABC@In.Vink.test",
      from: " Facturen@Hoekstra.nl ",
      attachments: [
        { filename: "F-118.pdf", mimeType: "application/pdf", content: pdf },
        { filename: "photo.jpg", mimeType: "image/jpeg", content: new Uint8Array([1, 2]) },
        { filename: "scan.PDF", mimeType: "application/octet-stream", content: pdf.buffer as ArrayBuffer },
        { filename: null, mimeType: "application/pdf", content: pdf },
        { filename: "huge.pdf", mimeType: "application/pdf", content: new Uint8Array(10 * 1024 * 1024 + 1) },
      ],
    },
    () => `intake/${++n}`,
  );

  expect(plan.token).toBe("k3y9abc");
  expect(plan.from).toBe("facturen@hoekstra.nl");
  expect(plan.store.map((s) => s.key)).toEqual(["intake/1", "intake/2", "intake/3"]);
  expect(plan.entries).toEqual([
    { key: "intake/1", filename: "F-118.pdf" },
    { filename: "photo.jpg", skipped: "not_pdf" },
    { key: "intake/2", filename: "scan.PDF" },
    { key: "intake/3", filename: "attachment-4" },
    { filename: "huge.pdf", skipped: "too_large" },
  ]);
});

test("a PDF of exactly 10 MB is stored; one byte more and it is skipped as too large", () => {
  let n = 0;
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      attachments: [
        { filename: "edge.pdf", mimeType: "application/pdf", content: new Uint8Array(10 * 1024 * 1024) },
        { filename: "over.pdf", mimeType: "application/pdf", content: new Uint8Array(10 * 1024 * 1024 + 1) },
      ],
    },
    () => `intake/${++n}`,
  );
  expect(plan.entries).toEqual([
    { key: "intake/1", filename: "edge.pdf" },
    { filename: "over.pdf", skipped: "too_large" },
  ]);
});

test("an email without attachments still reaches Vink, with none listed", () => {
  const plan = planEmail({ to: "t@x.test", from: "a@b.test", attachments: [] }, () => "k");
  expect(plan).toEqual({ token: "t", from: "a@b.test", store: [], entries: [] });
});

test("the token is the recipient's local part", () => {
  expect(tokenOf("AbC123@intake.example")).toBe("abc123");
});

test("a DMARC failure in Authentication-Results is detected", () => {
  expect(failsDmarc("mx.cloudflare.net; dkim=pass; spf=pass; dmarc=fail (p=reject)")).toBe(true);
  expect(failsDmarc("mx.cloudflare.net; dkim=pass; dmarc=pass")).toBe(false);
  expect(failsDmarc(null)).toBe(false);
});

test("the Worker's copies of the input limits match convex/lib/inputLimits.ts", async () => {
  const limits = await import("../../../convex/lib/inputLimits");
  const worker = await import("./map");
  expect(worker.MAX_BYTES).toBe(limits.MAX_PDF_BYTES);
  expect(worker.MAX_IMAGE_BYTES).toBe(limits.MAX_IMAGE_BYTES);
  expect([...worker.IMAGE_MIME_TYPES]).toEqual([...limits.IMAGE_MIME_TYPES]);
  expect(worker.MAX_EMAIL_BODY_BYTES).toBe(limits.MAX_EMAIL_BODY_BYTES);
  expect(worker.MAX_EMAIL_ATTACHMENTS).toBe(limits.MAX_EMAIL_ATTACHMENTS);
});
