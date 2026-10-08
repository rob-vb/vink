// "Describe in words" for a new Form (PLAN step 10): the Admin writes what the
// document is and which data they need, and the Proposer proposes the Fields
// from that text alone. Free of Convex imports; the app imports this file too.

export const MAX_DESCRIPTION_CHARS = 2000;

// The refusals' texts. The app translates them by their exact text (lib/server-errors.ts).
export const DESCRIPTION_EMPTY = "Describe the document and the data you need first.";
export const DESCRIPTION_TOO_LONG = `The description is longer than ${MAX_DESCRIPTION_CHARS} characters.`;

/** How a description proposal is named in the list of open proposals: its first words. */
export function descriptionTitle(description: string) {
  const text = description.trim().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
}
