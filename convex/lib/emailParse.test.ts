import { expect, test } from "vitest";
import { looksLikeEmail, parseEml } from "./emailParse";

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
