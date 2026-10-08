import { expect, test } from "vitest";
import { failsDmarc, htmlToText, planEmail, tokenOf } from "./map";

const pdf = new TextEncoder().encode("%PDF-1.7 …");

const jpeg = new Uint8Array([0xff, 0xd8, 1, 2]);

test("each PDF and image is stored under its own key; everything else is listed as skipped", () => {
  let n = 0;
  const plan = planEmail(
    {
      to: "K3y9ABC@In.Vink.test",
      from: " Facturen@Hoekstra.nl ",
      attachments: [
        { filename: "F-118.pdf", mimeType: "application/pdf", content: pdf },
        { filename: "photo.jpg", mimeType: "image/jpeg", content: jpeg },
        { filename: "scan.PDF", mimeType: "application/octet-stream", content: pdf.buffer as ArrayBuffer },
        { filename: null, mimeType: "application/pdf", content: pdf },
        { filename: "huge.pdf", mimeType: "application/pdf", content: new Uint8Array(10 * 1024 * 1024 + 1) },
        { filename: "IMG_0042.HEIC", mimeType: "application/octet-stream", content: jpeg },
        { filename: "iphone.jpg", mimeType: "image/jpg", content: jpeg },
        { filename: "sheet.xlsx", mimeType: "application/vnd.ms-excel", content: jpeg },
        { filename: "huge.png", mimeType: "image/png", content: new Uint8Array(10 * 1024 * 1024 + 1) },
      ],
    },
    () => `intake/${++n}`,
  );

  expect(plan.token).toBe("k3y9abc");
  expect(plan.from).toBe("facturen@hoekstra.nl");
  expect(plan.store.map((s) => [s.key, s.mimeType])).toEqual([
    ["intake/1", "application/pdf"],
    ["intake/2", "image/jpeg"],
    ["intake/3", "application/pdf"],
    ["intake/4", "application/pdf"],
    ["intake/5", "image/heic"],
    ["intake/6", "image/jpeg"],
  ]);
  expect(plan.entries).toEqual([
    { key: "intake/1", filename: "F-118.pdf", mimeType: "application/pdf" },
    { key: "intake/2", filename: "photo.jpg", mimeType: "image/jpeg" },
    { key: "intake/3", filename: "scan.PDF", mimeType: "application/pdf" },
    { key: "intake/4", filename: "attachment-4", mimeType: "application/pdf" },
    { filename: "huge.pdf", skipped: "too_large" },
    { key: "intake/5", filename: "IMG_0042.HEIC", mimeType: "image/heic" },
    { key: "intake/6", filename: "iphone.jpg", mimeType: "image/jpeg" },
    { filename: "sheet.xlsx", skipped: "unsupported_type" },
    { filename: "huge.png", skipped: "image_too_large" },
  ]);
});

test("the whole mail is passed on: subject, date and the text, preferring text/plain", () => {
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      subject: "  Klacht over levering 4410 ",
      date: "2026-10-06T07:12:00.000Z",
      text: "De levering was onvolledig.\n",
      html: "<p>Niet dit.</p>",
      attachments: [],
    },
    () => "k",
  );
  expect(plan).toMatchObject({
    subject: "Klacht over levering 4410",
    date: "2026-10-06T07:12:00.000Z",
    body: "De levering was onvolledig.",
    bodyTooLarge: false,
  });
});

test("without a text part the HTML part is the text, stripped", () => {
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      html: "<html><head><style>p{}</style></head><body><p>Hallo&nbsp;Anouk,</p><p>Fa&uuml;ctuur &amp; werkbon &#8364;5<br>Groet</p><script>x()</script></body></html>",
      attachments: [],
    },
    () => "k",
  );
  expect(plan.body).toBe("Hallo Anouk,\nFa&uuml;ctuur & werkbon €5\nGroet");
  expect(htmlToText("<div>een</div><div>twee</div>")).toBe("een\ntwee");
});

test("a text over 200 KiB is not sent; the attachments still are", () => {
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      text: "x".repeat(200 * 1024 + 1),
      attachments: [{ filename: "a.pdf", mimeType: "application/pdf", content: pdf }],
    },
    () => "k",
  );
  expect(plan).toMatchObject({ body: "", bodyTooLarge: true });
  expect(plan.entries).toEqual([{ key: "k", filename: "a.pdf", mimeType: "application/pdf" }]);
  expect(planEmail({ to: "t@x.test", from: "a@b.test", text: "x".repeat(200 * 1024), attachments: [] }, () => "k").bodyTooLarge).toBe(false);
});

test("at most 10 PDFs and images are stored; the rest are skipped, and other types do not count", () => {
  let n = 0;
  const attachments = [
    { filename: "notes.txt", mimeType: "text/plain", content: new Uint8Array([1]) },
    ...Array.from({ length: 11 }, (_, i) => ({ filename: `p${i}.pdf`, mimeType: "application/pdf", content: pdf })),
  ];
  const plan = planEmail({ to: "t@x.test", from: "a@b.test", attachments }, () => `k${++n}`);
  expect(plan.store).toHaveLength(10);
  expect(plan.entries[0]).toEqual({ filename: "notes.txt", skipped: "unsupported_type" });
  expect(plan.entries[11]).toEqual({ filename: "p10.pdf", skipped: "too_many_attachments" });
});

test("the attachments of one mail together are at most 12 MB; the one that goes over is skipped", () => {
  const mb = (n: number) => new Uint8Array(n * 1024 * 1024);
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      attachments: [
        { filename: "a.pdf", mimeType: "application/pdf", content: mb(7) },
        { filename: "b.jpg", mimeType: "image/jpeg", content: mb(5) },
        { filename: "c.png", mimeType: "image/png", content: mb(1) },
      ],
    },
    (() => {
      let n = 0;
      return () => `k${++n}`;
    })(),
  );
  expect(plan.entries).toEqual([
    { key: "k1", filename: "a.pdf", mimeType: "application/pdf" },
    { key: "k2", filename: "b.jpg", mimeType: "image/jpeg" },
    { filename: "c.png", skipped: "attachments_too_large" },
  ]);
});

test("the same plan comes out whichever Intake Address the mail was sent to", () => {
  // Which Form (or the Router) is Vink's to decide from the token: the Worker has no say.
  const mail = { from: "a@b.test", subject: "Factuur", text: "Zie bijlage.", attachments: [] };
  const organisation = planEmail({ ...mail, to: "orgtoken@in.vink.test" }, () => "k");
  const form = planEmail({ ...mail, to: "formtoken@in.vink.test" }, () => "k");
  expect({ ...organisation, token: "" }).toEqual({ ...form, token: "" });
  expect([organisation.token, form.token]).toEqual(["orgtoken", "formtoken"]);
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
    { key: "intake/1", filename: "edge.pdf", mimeType: "application/pdf" },
    { filename: "over.pdf", skipped: "too_large" },
  ]);
});

test("an email without attachments still reaches Vink, with none listed", () => {
  const plan = planEmail({ to: "t@x.test", from: "a@b.test", attachments: [] }, () => "k");
  expect(plan).toEqual({
    token: "t",
    from: "a@b.test",
    subject: "",
    date: "",
    body: "",
    bodyTooLarge: false,
    store: [],
    entries: [],
  });
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
  expect(worker.MAX_EMAIL_ATTACHMENT_BYTES).toBe(limits.MAX_EMAIL_ATTACHMENT_BYTES);
});
