import { expect, test } from "vitest";
import { failsDmarc, htmlToText, MAX_INLINE_ICON_BYTES, planEmail, tokenOf } from "./map";

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

test("a signature logo and icons are dropped; a real photo inline from a phone is kept", () => {
  let n = 0;
  const kb = (size: number) => new Uint8Array(size * 1024);
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      html: '<p>Zie de foto.</p><img src="cid:photo-1@phone"><p>Groet,<br>Anouk</p><img src="CID:logo@sig"><img src="cid:linkedin@sig">',
      text: "Zie de foto.\nGroet, Anouk",
      attachments: [
        // Referenced by the HTML and inline: the signature logo.
        { filename: "logo.png", mimeType: "image/png", disposition: "inline", contentId: "<logo@sig>", content: kb(12) },
        // No disposition header at all, but the HTML shows it by cid: a social icon.
        { filename: "linkedin.png", mimeType: "image/png", contentId: "<LinkedIn@sig>", content: kb(2) },
        // An icon type Vink does not read anyway: dropped, not listed as refused.
        { filename: "twitter.gif", mimeType: "image/gif", disposition: "inline", content: kb(1) },
        // A phone's inline photo: far larger than an icon.
        { filename: "IMG_0042.jpg", mimeType: "image/jpeg", disposition: "inline", contentId: "<photo-1@phone>", content: kb(2400) },
      ],
    },
    () => `intake/${++n}`,
  );
  expect(plan.entries).toEqual([{ key: "intake/1", filename: "IMG_0042.jpg", mimeType: "image/jpeg" }]);
  expect(plan.store).toHaveLength(1);
  expect(plan.body).toBe("Zie de foto.\nGroet, Anouk");
});

test("only small inline images are dropped: attachments, big images and PDFs are kept, and the icon limit is 50 KB", () => {
  let n = 0;
  const icon = new Uint8Array(MAX_INLINE_ICON_BYTES - 1);
  const edge = new Uint8Array(MAX_INLINE_ICON_BYTES);
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      html: '<img src="cid:a@x"><img src="cid:b@x">',
      attachments: [
        // A small image that is a real attachment (not inline, not shown in the text): a scan.
        { filename: "scan.png", mimeType: "image/png", disposition: "attachment", content: icon },
        // Not inline and not referenced, though it has a Content-ID.
        { filename: "other.png", mimeType: "image/png", contentId: "<zzz@x>", content: icon },
        // Referenced, small: dropped.
        { filename: "a.png", mimeType: "image/png", disposition: "inline", contentId: "<a@x>", content: icon },
        // Exactly 50 KB, inline: kept (the limit is below 50 KB).
        { filename: "b.png", mimeType: "image/png", disposition: "inline", contentId: "<b@x>", content: edge },
        // An inline PDF is never an icon.
        { filename: "f.pdf", mimeType: "application/pdf", disposition: "inline", content: pdf },
      ],
    },
    () => `intake/${++n}`,
  );
  expect(plan.entries.map((e) => e.filename)).toEqual(["scan.png", "other.png", "b.png", "f.pdf"]);
});

test("dropped icons do not count towards the 10 attachments", () => {
  const icons = Array.from({ length: 12 }, (_, i) => ({
    filename: `i${i}.png`,
    mimeType: "image/png",
    disposition: "inline" as const,
    content: new Uint8Array(1024),
  }));
  const plan = planEmail(
    {
      to: "t@x.test",
      from: "a@b.test",
      attachments: [...icons, ...Array.from({ length: 10 }, (_, i) => ({ filename: `p${i}.pdf`, mimeType: "application/pdf", content: pdf }))],
    },
    () => "k",
  );
  expect(plan.store).toHaveLength(10);
  expect(plan.entries.every((e) => "key" in e)).toBe(true);
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

test("htmlToText takes linear time on mail built to make regexes backtrack, and reads only the first 256 KB", () => {
  const hostile = [
    "<".repeat(200_000),
    "<a".repeat(100_000),
    "<script>".repeat(30_000),
    "<head>".repeat(30_000) + "x",
    "<br" + " ".repeat(200_000),
    "a" + " ".repeat(200_000) + "b",
    "&" + "a".repeat(200_000),
  ];
  for (const html of hostile) {
    const start = performance.now();
    htmlToText(html);
    expect(performance.now() - start).toBeLessThan(200);
  }
  expect(htmlToText("x".repeat(300 * 1024))).toHaveLength(256 * 1024);
  expect(htmlToText("<head><title>t</title></head><header>Kop</header><SCRIPT>a<b</SCRIPT>tekst<style>p{}</style>")).toBe("Koptekst");
  expect(htmlToText("<script>open <b>zonder</b> einde")).toBe("open zonder einde");
});

test("the Worker's htmlToText gives the same text as convex/lib/emailParse.ts", async () => {
  const { htmlToText: app } = await import("../../../convex/lib/emailParse");
  for (const html of [
    "<html><head><style>p{}</style></head><body><p>Hallo&nbsp;Anouk,</p><p>Fa&uuml;ctuur &amp; werkbon &#8364;5<br>Groet</p><script>x()</script></body></html>",
    "<div>een</div><div>twee   </div>\n\n\n\n<header>kop</header>",
    "<script>a</script>b<script>c",
    "<<b>>x",
  ]) {
    expect(htmlToText(html)).toBe(app(html));
  }
});

test("a file name over 255 characters and a From or Subject over 320 are cut", () => {
  const plan = planEmail(
    {
      to: "t@x.test",
      from: `${"a".repeat(400)}@b.test`,
      subject: "s".repeat(1000),
      attachments: [
        { filename: `${"n".repeat(400)}.pdf`, mimeType: "application/pdf", content: pdf },
        { filename: `${"m".repeat(400)}.docx`, mimeType: "application/msword", content: pdf },
      ],
    },
    () => "k",
  );
  expect(plan.from).toHaveLength(320);
  expect(plan.subject).toHaveLength(320);
  expect(plan.entries.map((e) => e.filename.length)).toEqual([255, 255]);
});
