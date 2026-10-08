import { describe, expect, it, vi } from "vitest";
import { findSource } from "@/components/documents/review-panes";
import { seedDocuments } from "./demo-data";
import { demoPages, demoPhotos } from "./demo-papers";
import { initialDocuments, type Locale } from "./demo-state";

// next/font only works inside Next; the papers only need a class name from it.
vi.mock("next/font/google", () => ({ Caveat: () => ({ className: "hand" }) }));

const locales: Locale[] = ["en", "nl"];

describe("the demo's emails and photos", () => {
  const emails = seedDocuments.filter((d) => d.email);

  it("marks the text of every value read on an email body, in both languages", () => {
    for (const seed of emails) {
      for (const locale of locales) {
        for (const field of seed.fields.filter((f) => f.page === 1)) {
          expect(findSource(seed.email!.body[locale], field.readText), `${seed.id} ${field.key} ${locale}`).not.toBeNull();
        }
      }
    }
  });

  it("reads values from pages that exist: the body, then the attachments", () => {
    for (const seed of emails) {
      const pages = 1 + seed.email!.attachments.length;
      for (const field of seed.fields) expect(field.page).toBeLessThanOrEqual(pages);
    }
  });

  it("draws every photo it names, with alt text in both languages", () => {
    for (const seed of seedDocuments) {
      for (const a of seed.email?.attachments ?? []) {
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
      for (const document of initialDocuments(locale)) {
        if (document.kind === "pdf") expect(demoPages[document.id as keyof typeof demoPages]).toBeDefined();
        if (document.kind === "email") expect(document.email).not.toBeNull();
        if (document.kind === "image") expect(document.photo).not.toBeNull();
      }
    }
  });

  it("has a Document in No Form, with no values and nothing to approve", () => {
    for (const locale of locales) {
      const noForm = initialDocuments(locale).filter((d) => d.state === "no_form");
      expect(noForm.map((d) => d.id)).toEqual(["newsletter"]);
      expect(noForm[0].fieldValues).toEqual([]);
      expect(noForm[0].noFormDetail).toBeTruthy();
    }
  });
});
