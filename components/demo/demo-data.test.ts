import { describe, expect, it, vi } from "vitest";
import { emailPageCount, findSource, locatePage } from "@/components/submissions/review-panes";
import { inLocale, seedSubmissions } from "./demo-data";
import { demoPages, demoPhotos } from "./demo-papers";
import { initialSubmissions, type Locale } from "./demo-state";

// next/font only works inside Next; the papers only need a class name from it.
vi.mock("next/font/google", () => ({ Caveat: () => ({ className: "hand" }) }));

const locales: Locale[] = ["en", "nl"];

describe("the demo's emails and photos", () => {
  const emails = seedSubmissions.filter((d) => d.email);

  it("marks the text of every value read on an email body, in both languages", () => {
    for (const seed of emails) {
      for (const locale of locales) {
        for (const field of seed.fields.filter((f) => f.page === 1)) {
          expect(findSource(seed.email!.body[locale], inLocale(field.readText, locale)), `${seed.id} ${field.key} ${locale}`).not.toBeNull();
        }
      }
    }
  });

  it("reads values from pages that exist: the body, then the attachments", () => {
    for (const submission of initialSubmissions("en").filter((d) => d.email)) {
      const seed = seedSubmissions.find((s) => s.id === submission.id)!;
      const pages = emailPageCount(submission.email!.attachments);
      for (const page of [...seed.fields.map((f) => f.page), ...(seed.lists ?? []).map((l) => l.page)]) {
        expect(page).toBeLessThanOrEqual(pages);
      }
    }
  });

  it("draws every photo it names, with alt text in both languages", () => {
    for (const seed of seedSubmissions) {
      for (const a of seed.email?.attachments ?? []) {
        if ("pdf" in a) {
          expect(demoPages[a.pdf]).toBeDefined();
          continue;
        }
        expect(demoPhotos[a.photo]).toBeDefined();
        expect(a.alt.en && a.alt.nl).toBeTruthy();
      }
      if (seed.kind === "image") {
        expect(demoPhotos[seed.id as keyof typeof demoPhotos]).toBeDefined();
        expect(seed.photoAlt?.en && seed.photoAlt.nl).toBeTruthy();
      }
    }
  });

  it("picks the pane by kind: PDFs draw paper pages, the others do not", () => {
    for (const locale of locales) {
      for (const submission of initialSubmissions(locale)) {
        if (submission.kind === "pdf") expect(demoPages[submission.id as keyof typeof demoPages]).toBeDefined();
        if (submission.kind === "email") expect(submission.email).not.toBeNull();
        if (submission.kind === "image") expect(submission.photo).not.toBeNull();
      }
    }
  });

  it("has a Submission in No Form, with no values and nothing to approve", () => {
    for (const locale of locales) {
      const noForm = initialSubmissions(locale).filter((d) => d.state === "no_form");
      expect(noForm.map((d) => d.id)).toEqual(["newsletter"]);
      expect(noForm[0].fieldValues).toEqual([]);
      expect(noForm[0].noFormInfo).toEqual({ code: "no_fit", form: locale === "nl" ? "Facturen" : "Invoices" });
    }
  });
});

describe("the demo's values follow the language", () => {
  const valueOf = (locale: Locale, id: string, key: string) =>
    initialSubmissions(locale)
      .find((d) => d.id === id)!
      .fieldValues.find((f) => f.key === key)!.value;

  it("writes what Vink saw in a photo in the visitor's language", () => {
    expect(valueOf("nl", "complaint", "problem")).toBe("Plas water onder de machine");
    expect(valueOf("en", "complaint", "problem")).toBe("Puddle under the machine");
  });

  it("keeps the words of the drawn work order, which is Dutch in both languages", () => {
    for (const locale of locales) {
      expect(valueOf(locale, "workorder", "work")).toBe("Kraan vervangen");
      expect(valueOf(locale, "workorder", "materials")).toBe("mengkraan + slangen");
    }
  });
});

describe("the damage claim email", () => {
  const claim = (locale: Locale) => initialSubmissions(locale).find((d) => d.id === "claim")!;

  it("is one email with its text, a one-page PDF form and two photos: 4 Items", () => {
    for (const locale of locales) {
      const submission = claim(locale);
      expect(submission.kind).toBe("email");
      expect(submission.email!.attachments.map((a) => a.mimeType)).toEqual(["application/pdf", "image/jpeg", "image/jpeg"]);
      expect(emailPageCount(submission.email!.attachments)).toBe(4);
      expect(submission.routed).toMatchObject({ code: "routed", form: locale === "nl" ? "Schademeldingen" : "Damage claims" });
    }
  });

  it("reads the form's values on the PDF, the email's second page", () => {
    const submission = claim("nl");
    const pdf = submission.fieldValues.filter((f) => f.key !== "policy_number");
    for (const f of pdf) expect(locatePage(submission.email!.attachments, f.pages[0])).toEqual({ part: "attachment", index: 0, page: 1 });
  });

  it("keeps the customer's Dutch in both languages: the email and the values", () => {
    expect(claim("en").email!.body).toBe(claim("nl").email!.body);
    expect(claim("en").fieldValues.map((f) => f.value)).toEqual(claim("nl").fieldValues.map((f) => f.value));
  });

  it("asks to review only what Vink is unsure of: the vague cause and the ± year", () => {
    const submission = claim("en");
    const flagged = [
      ...submission.fieldValues,
      ...submission.lists.flatMap((l) => l.entries.flatMap((e) => e.fieldValues)),
    ].filter((f) => f.needsReview);
    expect(flagged.map((f) => [f.key, f.readText])).toEqual([
      ["cause", "mogelijk de afvoer van de vaatwasser"],
      ["purchase_year", "± 2019"],
    ]);
  });

  it("claims items that add up to the total on the form", () => {
    const submission = claim("nl");
    const items = submission.lists.find((l) => l.key === "damaged_items")!;
    const sum = items.entries.reduce((n, e) => n + (e.fieldValues.find((f) => f.key === "claimed")!.value as number), 0);
    expect(sum).toBe(submission.fieldValues.find((f) => f.key === "total_claimed")!.value);
  });
});
