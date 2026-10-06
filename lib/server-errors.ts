import type { Locale } from "@/i18n/routing";

// Convex's error messages are English sentences (and a few codes, like
// "LastAdmin"); the app shows them in the visitor's language. A message that
// isn't listed here is shown as it is.

const dutch: Record<string, string> = {
  // Codes
  Unauthenticated: "Je bent niet meer ingelogd. Log opnieuw in.",
  Forbidden: "Dat mag je in deze Organisatie niet doen.",
  LastAdmin: "Een Organisatie heeft minstens één Admin nodig.",
  AlreadyMember: "Dat adres heeft hier al een Lidmaatschap.",
  InvalidEmail: "Vul een geldig e-mailadres in.",
  MembershipNotFound: "Dat Lidmaatschap bestaat niet meer.",
  InvitationNotFound: "Die Uitnodiging bestaat niet meer.",
  InvitationUsed: "Deze uitnodiging is al gebruikt.",
  InvitationExpired: "Deze uitnodiging is verlopen.",
  InvitationForAnotherEmail: "Deze uitnodiging is voor een ander e-mailadres.",

  // Why an emailed attachment was skipped (convex/intake.ts)
  "Not a PDF.": "Geen pdf.",
  "The attachment is larger than 25 MB.": "De bijlage is groter dan 25 MB.",

  // Not found
  "Not found": "Niet gevonden",
  "Organisation not found": "Organisatie niet gevonden",
  "Document not found": "Document niet gevonden",
  "Form not found": "Formulier niet gevonden",
  "Form Version not found": "Formulierversie niet gevonden",
  "Form Proposal not found": "Formuliervoorstel niet gevonden",
  "Integration not found": "Koppeling niet gevonden",
  "Delivery not found": "Levering niet gevonden",
  "List not found": "Lijst niet gevonden",
  "Entry not found": "Regel niet gevonden",

  // Documents
  "The upload didn't arrive. Try again.": "De upload is niet aangekomen. Probeer het opnieuw.",
  "This file isn't a PDF Vink can read.": "Dit bestand is geen pdf die Vink kan lezen.",
  "The PDF was deleted": "De pdf is verwijderd",
  "This Document is approved": "Dit Document is goedgekeurd",
  "This Document's Form can't be changed now": "Het Formulier van dit Document kan nu niet worden gewijzigd",
  "The Document is already on this Form": "Het Document staat al op dit Formulier",
  "This Document can't be reviewed now": "Dit Document kan nu niet worden gecontroleerd",
  "This Document can't be rejected now": "Dit Document kan nu niet worden afgewezen",
  "Only a Rejected Document can be reopened": "Alleen een Afgewezen Document kan worden heropend",
  "This Document's PDF is gone, so it can't be reopened":
    "De pdf van dit Document is weg, dus het kan niet worden heropend",
  "This Document's data was deleted": "De gegevens van dit Document zijn verwijderd",
  "This Document's data was already deleted": "De gegevens van dit Document zijn al verwijderd",
  "Only a failed Extraction can be retried": "Alleen een mislukte Extractie kan opnieuw worden geprobeerd",

  // Forms
  "A Form needs a name": "Een Formulier heeft een naam nodig",
  "The Review Threshold must be from 0 to 1": "De Controledrempel moet tussen 0 en 1 liggen",
  "Only a failed proposal can be retried": "Alleen een mislukt voorstel kan opnieuw worden geprobeerd",
  "This proposal can't be saved as a new Form": "Dit voorstel kan niet als nieuw Formulier worden opgeslagen",
  "This proposal doesn't extend a Form": "Dit voorstel vult geen bestaand Formulier aan",

  // Integrations and Deliveries
  "An Integration needs a name": "Een Koppeling heeft een naam nodig",
  "The endpoint must be an https URL": "Het endpoint moet een https-URL zijn",
  "Choose an Approved Document of this Form": "Kies een Goedgekeurd Document van dit Formulier",
  "Only an Approved Document can be test-sent": "Alleen een Goedgekeurd Document kan als test worden verstuurd",
  "Only a failed Delivery can be sent again": "Alleen een mislukte Levering kan opnieuw worden verstuurd",
  "Integration removed: this Delivery can't be sent again":
    "Koppeling verwijderd: deze Levering kan niet opnieuw worden verstuurd",
};

// What a corrected value must be (convex/review.ts `expectedType`).
const expectedType: Record<string, string> = {
  text: "tekst",
  "a number": "een getal",
  "a date (yyyy-mm-dd)": "een datum (jjjj-mm-dd)",
  "yes or no": "ja of nee",
  "one of its options": "een van de opties",
};

// The kind of thing a duplicate key belongs to (convex/forms.ts `checkFields`).
function dutchKind(kind: string) {
  if (kind === "Field") return "Veld";
  const sub = kind.match(/^sub-Field of the List Field "(.+)"$/);
  return sub ? `subveld van de Lijst "${sub[1]}"` : kind;
}

const dutchPatterns: [RegExp, (...groups: string[]) => string][] = [
  [/^1 value still needs review$/, () => "1 waarde moet nog gecontroleerd worden"],
  [/^(\d+) values still need review$/, (n) => `${n} waarden moeten nog gecontroleerd worden`],
  [
    /^This PDF has (\d+) pages\. Vink reads up to (\d+) pages per Document\.$/,
    (pages, max) => `Deze pdf heeft ${pages} pagina's. Vink leest maximaal ${max} pagina's per Document.`,
  ],
  [/^Keep data from 1 to (\d+) days$/, (max) => `Bewaar data 1 tot ${max} dagen`],
  [
    /^The key "(.+)" is locked while an Integration is attached: keep that Field$/,
    (key) => `De sleutel "${key}" ligt vast zolang er een Koppeling aan hangt: houd dat Veld`,
  ],
  [
    /^The key "(.+)" is locked while an Integration is attached$/,
    (key) => `De sleutel "${key}" ligt vast zolang er een Koppeling aan hangt`,
  ],
  [
    /^The List Field "(.+)" needs at least one sub-Field$/,
    (key) => `De Lijst "${key}" heeft minstens één subveld nodig`,
  ],
  [
    /^"(.+)" isn't a valid key: use snake_case: lowercase letters, digits and single underscores, starting with a letter$/,
    (key) =>
      `"${key}" is geen geldige sleutel: gebruik snake_case: kleine letters, cijfers en losse liggende streepjes, beginnend met een letter`,
  ],
  [/^The Field "(.+)" needs a label$/, (key) => `Het Veld "${key}" heeft een label nodig`],
  [
    /^The key "(.+)" is used by more than one (.+)$/,
    (key, kind) => `De sleutel "${key}" wordt door meer dan één ${dutchKind(kind)} gebruikt`,
  ],
  [
    /^The choice Field "(.+)" needs at least one option$/,
    (key) => `Het Keuzeveld "${key}" heeft minstens één optie nodig`,
  ],
  [
    /^Every option of the choice Field "(.+)" needs a value$/,
    (key) => `Elke optie van het Keuzeveld "${key}" heeft een waarde nodig`,
  ],
  [
    /^The choice Field "(.+)" has the option "(.+)" more than once$/,
    (key, value) => `Het Keuzeveld "${key}" heeft de optie "${value}" meer dan eens`,
  ],
  [/^"(.+)" isn't a valid header name$/, (name) => `"${name}" is geen geldige headernaam`],
  [/^Vink sets the (.+) header itself$/, (name) => `Vink zet de header ${name} zelf`],
  [/^The header (.+) needs a value$/, (name) => `De header ${name} heeft een waarde nodig`],
  [
    /^(.+) is required: add an entry first$/,
    (label) => `${label} is verplicht: voeg eerst een regel toe`,
  ],
  [/^(.+) is required$/, (label) => `${label} is verplicht`],
  [
    /^(.+) needs (text|a number|a date \(yyyy-mm-dd\)|yes or no|one of its options)$/,
    (label, type) => `${label} moet ${expectedType[type]} zijn`,
  ],
];

export function serverErrorText(message: string, locale: Locale) {
  if (locale !== "nl") return message;
  if (Object.hasOwn(dutch, message)) return dutch[message];
  for (const [pattern, text] of dutchPatterns) {
    const match = message.match(pattern);
    if (match) return text(...match.slice(1));
  }
  return message;
}
