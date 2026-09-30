import { expect, test } from "vitest";
import { securityTxt } from "./security-txt";

const now = new Date("2026-09-30T10:00:00.000Z");

test("points to security@ on the site's own host, expires a year ahead, and names its canonical URL", () => {
  expect(securityTxt({ siteUrl: "https://vink.example", now })).toBe(
    [
      "Contact: mailto:security@vink.example",
      "Expires: 2027-09-30T10:00:00Z",
      "Preferred-Languages: en, nl",
      "Canonical: https://vink.example/.well-known/security.txt",
      "",
    ].join("\n"),
  );
});

test("a configured contact wins: an address becomes mailto:, a URL stays as it is", () => {
  expect(securityTxt({ siteUrl: "https://vink.example", contact: "rob@vink.example", now })).toContain(
    "Contact: mailto:rob@vink.example\n",
  );
  expect(
    securityTxt({ siteUrl: "https://vink.example", contact: "https://vink.example/security", now }),
  ).toContain("Contact: https://vink.example/security\n");
});
