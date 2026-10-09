import { expect, test } from "vitest";
import { htmlToText, looksLikeEmail, parseEml } from "./emailParse";

const bytes = (text: string) => new TextEncoder().encode(text.replace(/\n/g, "\r\n"));
const PDF = btoa("%PDF-1.4 fake");
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));

test("reads the headers of a plain email, with folded and encoded words", () => {
  const mail = parseEml(
    bytes(`From: "Wit, Bakkerij" <info@dewit.example>
Subject: =?UTF-8?B?RmFjdHV1ciA=?= =?UTF-8?Q?okt=C3=B3ber?=
Date: Tue, 06 Oct 2026 09:00:00 +0200
Content-Type: text/plain; charset=utf-8

Hallo,
het totaal is 151,25.
`),
  );
  expect(mail).toMatchObject({
    subject: "Factuur október",
    from: '"Wit, Bakkerij" <info@dewit.example>',
    date: "2026-10-06T07:00:00.000Z",
    body: "Hallo,\nhet totaal is 151,25.",
    attachments: [],
    skipped: [],
  });
});

test("takes the text part of multipart/alternative, else the HTML as text", () => {
  const alternative = parseEml(
    bytes(`Subject: x
Content-Type: multipart/alternative; boundary=zz

--zz
Content-Type: text/plain

plain words
--zz
Content-Type: text/html

<p>html words</p>
--zz--
`),
  );
  expect(alternative.body).toBe("plain words");

  const htmlOnly = parseEml(
    bytes(`Subject: x
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<style>p{}</style><p>Totaal: =E2=82=AC 12&nbsp;&amp; meer</p>
`),
  );
  expect(htmlOnly.body).toBe("Totaal: € 12 & meer");
});

test("decodes other charsets", () => {
  const mail = parseEml(
    bytes(`Subject: x
Content-Type: text/plain; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

caf=E9
`),
  );
  expect(mail.body).toBe("café");
});

test("keeps PDF and image attachments, skips other files and small inline logos", () => {
  const mail = parseEml(
    bytes(`Subject: x
Content-Type: multipart/mixed; boundary=m

--m
Content-Type: multipart/related; boundary=r

--r
Content-Type: text/plain

See the files.
--r
Content-Type: image/png
Content-Disposition: inline; filename="logo.png"
Content-ID: <logo@x>
Content-Transfer-Encoding: base64

${PNG}
--r--
--m
Content-Type: application/pdf; name="../factuur.pdf"
Content-Disposition: attachment; filename*=UTF-8''fact%C3%BCur.pdf
Content-Transfer-Encoding: base64

${PDF}
--m
Content-Type: image/png
Content-Disposition: attachment; filename="bon.png"
Content-Transfer-Encoding: base64

${PNG}
--m
Content-Type: application/zip
Content-Disposition: attachment; filename="all.zip"
Content-Transfer-Encoding: base64

UEsDBA==
--m--
`),
  );
  expect(mail.body).toBe("See the files.");
  expect(mail.attachments.map((a) => a.filename)).toEqual(["factüur.pdf", "bon.png"]);
  expect(mail.skipped).toEqual(["all.zip"]);
});

test("a file that is not an email gives an empty email, and does not throw", () => {
  expect(parseEml(new Uint8Array())).toMatchObject({ subject: "", body: "", attachments: [] });
  expect(parseEml(new Uint8Array([0, 1, 2, 255, 254]))).toMatchObject({ attachments: [] });
});

test("recognises an email file by a header only emails have", () => {
  expect(looksLikeEmail(bytes("Subject: hi\n\nbody"))).toBe(true);
  expect(looksLikeEmail(bytes("From: a@b.example\nTo: c@d.example\n\nbody"))).toBe(true);
  expect(looksLikeEmail(bytes("Just some text\nwith lines"))).toBe(false);
  expect(looksLikeEmail(bytes("Title: a note\n\nbody"))).toBe(false);
  expect(looksLikeEmail(new Uint8Array([0x53, 0x75, 0, 0x3a]))).toBe(false);
});

// --- html as text: bounded work on hostile input ---

/** The time `run` takes, in ms. */
function timed(run: () => void) {
  const start = performance.now();
  run();
  return performance.now() - start;
}

test("htmlToText takes linear time on mail built to make regexes backtrack", () => {
  const hostile = [
    "<".repeat(200_000),
    "<a".repeat(100_000),
    "<script>".repeat(30_000),
    "<head>".repeat(30_000) + "x",
    "<style ".repeat(30_000),
    "<br" + " ".repeat(200_000),
    "a" + " ".repeat(200_000) + "b",
    "&" + "a".repeat(200_000),
    "<p>x</p>\n".repeat(25_000),
  ];
  for (const html of hostile) expect(timed(() => htmlToText(html))).toBeLessThan(200);
});

test("htmlToText removes script, style and head blocks, keeps header text, and reads only the first 256 KB", () => {
  expect(htmlToText("<head><title>t</title></head><header>Kop</header><SCRIPT type=x>a<b</SCRIPT>tekst<style>p{}</style>")).toBe("Koptekst");
  // No closing tag: only the tag itself goes.
  expect(htmlToText("<script>open <b>zonder</b> einde")).toBe("open zonder einde");
  expect(htmlToText("x".repeat(300 * 1024))).toHaveLength(256 * 1024);
});

test("a long quoted-printable body decodes and an email with 200k '<' parses fast", () => {
  const body = "=C3=A9".repeat(100_000);
  const mail = parseEml(
    bytes(`Subject: x
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

${body}
`),
  );
  expect(mail.body).toBe("é".repeat(100_000));
  const html = bytes(`Subject: x\nContent-Type: text/html\n\n${"<".repeat(200_000)}`);
  expect(timed(() => parseEml(html))).toBeLessThan(500);
});

test("a file name in RFC 2231 continuations is joined, in order, with encoded and plain pieces", () => {
  const mail = parseEml(
    bytes(`Subject: x
Content-Type: multipart/mixed; boundary=m

--m
Content-Type: application/pdf
Content-Disposition: attachment;
 filename*1*=%C3%BCr%20okt%C3%B3ber.pdf;
 filename*0*=utf-8''fact
Content-Transfer-Encoding: base64

${PDF}
--m
Content-Type: application/pdf
Content-Disposition: attachment; filename*0="werk"; filename*1="bon "; filename*2*=100%25.pdf
Content-Transfer-Encoding: base64

${PDF}
--m
Content-Type: application/pdf; name*0*=iso-8859-1''caf%E9-; name*1="menu.pdf"
Content-Disposition: attachment
Content-Transfer-Encoding: base64

${PDF}
--m--
`),
  );
  expect(mail.attachments.map((a) => a.filename)).toEqual(["factür október.pdf", "werkbon 100%.pdf", "café-menu.pdf"]);
});
