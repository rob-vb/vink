"use node";
// Verify (ADR 0003): Jev checks every filled value of a Document in one
// request. Fit: does the value fit its Field and the rest of the Document?
// Support: does its pages' text layer hold it? Asked only when there is one.
// With page images (Clef only), support is whether the page images show it,
// which a scan without a text layer gets too.
import { noul } from "@typesafe-ai/sdk";
import { models } from "./models";
import type { Verification, Verifier, VerifyRequest } from "./pipeline";
import { CLEF_MAX_IMAGES, type PageImage, decide, fitsClef } from "./systemOne";

// Terms and conditions pages are long and carry nothing for the Form.
const PAGE_TEXT_MAX = 6000;

const SEEN = {
  true: "The page images show this value for this Field (allowing for normalisation such as date or number format)",
  false: "The page images lack the value, show a different value, or show it for a different Field",
};

type SeenValue = { field: string; description: string | null; value: string | number | boolean; readText: string; pages: number[] };

const seenValue = (r: VerifyRequest): SeenValue => ({
  field: r.label,
  description: r.field.description ?? null,
  value: r.value,
  readText: r.readText,
  pages: r.pages,
});

/**
 * Values grouped by the pages they come from, so each group is one Clef
 * request: its values and those pages' images, within Clef's limits. Values
 * without pages, or whose pages alone don't fit, are left out.
 */
function pageGroups(requests: VerifyRequest[], images: PageImage[]) {
  const groups: Array<{ pages: PageImage[]; indexes: number[] }> = [];
  const stateOf = (indexes: number[]) => ({ values: indexes.map((i) => seenValue(requests[i])) });
  requests.forEach((r, i) => {
    const pages = images.filter((p) => r.pages.includes(p.page));
    if (pages.length === 0 || !fitsClef(stateOf([i]), pages)) return;
    const group = groups.find((g) => {
      const union = [...new Set([...g.pages, ...pages])];
      return union.length <= CLEF_MAX_IMAGES && fitsClef(stateOf([...g.indexes, i]), union);
    });
    if (group) {
      group.pages = [...new Set([...group.pages, ...pages])].sort((a, b) => a.page - b.page);
      group.indexes.push(i);
    } else {
      groups.push({ pages, indexes: [i] });
    }
  });
  return groups.map((g) => ({ ...g, state: stateOf(g.indexes) }));
}

/** The Verifier; with `images`, support comes from the page images instead of the text layer (Clef only). */
export const verifierWith = (images?: () => PageImage[]): Verifier => ({
  async verify({ formName, formDescription, reading }, requests) {
    const state = {
      form: { name: formName, description: formDescription },
      document: reading,
      values: requests.map((r) => ({
        field: r.label,
        key: r.field.key,
        type: r.field.type,
        description: r.field.description ?? null,
        options: r.field.type === "choice" ? r.field.options.map((o) => o.value) : null,
        value: r.value,
        readText: r.readText,
        pages: r.pages,
        pageText: r.pageText?.slice(0, PAGE_TEXT_MAX) ?? null,
      })),
    };
    const questions: Record<string, ReturnType<typeof noul>> = {};
    requests.forEach((r, i) => {
      questions[`fit_${i}`] = noul(
        `Consider \`values[${i}]\`: a value extracted for the Field \`values[${i}].field\` of this Form, described as \`values[${i}].description\`. Does \`values[${i}].value\` fit what that Field asks for, and is it plausible given the other values in \`values\` and the rest of \`document\`?`,
        {
          true: "The value is the kind of thing the Field asks for and is consistent with the rest of the Document",
          false: "The value belongs to another Field, has the wrong kind or format, or conflicts with the rest of the Document",
        },
      );
      if (r.pageText !== null && !images) {
        questions[`support_${i}`] = noul(
          `Consider \`values[${i}]\`, read from page(s) \`values[${i}].pages\`. Does \`values[${i}].pageText\`, the text layer of those pages, contain \`values[${i}].readText\` and support \`values[${i}].value\` as the value for Field \`values[${i}].field\`?`,
          {
            true: "The page text contains this value for this Field (allowing for normalisation such as date or number format)",
            false: "The page text lacks the value, shows a different value, or shows it for a different Field",
          },
        );
      }
    });
    // Only the values and their pages: the whole Reading doesn't fit beside the images.
    const groups = images ? pageGroups(requests, images()) : [];
    const asked = await Promise.all([
      decide({ model: models.jev, state, questions }),
      ...groups.map(({ pages, indexes, state: seen }) =>
        decide({
          model: models.jev,
          state: {
            ...seen,
            pageImages: `The images are pages ${pages.map((p) => p.page).join(", ")} of the Document, in that order.`,
          },
          questions: Object.fromEntries(
            indexes.map((i, j) => [
              `seen_${i}`,
              noul(
                `Consider \`values[${j}]\`, read from page(s) \`values[${j}].pages\`. Do the images of those pages show \`values[${j}].readText\` and support \`values[${j}].value\` as the value for Field \`values[${j}].field\`?`,
                SEEN,
              ),
            ]),
          ),
          images: pages,
        }),
      ),
    ]);
    const answers = Object.assign({}, ...asked) as Awaited<ReturnType<typeof decide>>;
    return Object.fromEntries(
      requests.map((r, i): [string, Verification] => [
        r.id,
        {
          fit: answers[`fit_${i}`].noul,
          support: images
            ? (answers[`seen_${i}`]?.noul ?? null)
            : r.pageText === null
              ? null
              : answers[`support_${i}`].noul,
        },
      ]),
    );
  },
});

export const verifier = verifierWith();
