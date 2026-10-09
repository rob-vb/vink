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

  // Why an emailed attachment was skipped (convex/intake.ts); the 25 MB one is
  // still in emails recorded before the limit became 10 MB.
  "Not a PDF.": "Geen pdf.",
  "Vink reads PDFs, photos (JPG, PNG, HEIC) and the email text; this file type isn't supported.":
    "Vink leest pdf's, foto's (JPG, PNG, HEIC) en de tekst van de e-mail; dit bestandstype wordt niet ondersteund.",
  "The image is larger than 10 MB.": "De afbeelding is groter dan 10 MB.",
  "The email text is longer than 200 KB.": "De tekst van de e-mail is langer dan 200 KB.",
  "Vink reads up to 10 attachments per email.": "Vink leest maximaal 10 bijlagen per e-mail.",
  "The attachments of this email are larger than 12 MB together.":
    "De bijlagen van deze e-mail zijn samen groter dan 12 MB.",
  "This email has no text and no attachments.": "Deze e-mail heeft geen tekst en geen bijlagen.",
  "Cover note, not read": "Begeleidende tekst, niet gelezen",
  "The attachment is larger than 25 MB.": "De bijlage is groter dan 25 MB.",

  // Not found
  "Not found": "Niet gevonden",
  "Organisation not found": "Organisatie niet gevonden",
  "Submission not found": "Inzending niet gevonden",
  "Form not found": "Formulier niet gevonden",
  "Form Version not found": "Formulierversie niet gevonden",
  "Form Proposal not found": "Formuliervoorstel niet gevonden",
  "Integration not found": "Koppeling niet gevonden",
  "Delivery not found": "Levering niet gevonden",
  "List not found": "Lijst niet gevonden",
  "Entry not found": "Regel niet gevonden",

  // Submissions
  "The upload didn't arrive. Try again.": "De upload is niet aangekomen. Probeer het opnieuw.",
  "This file isn't a PDF Vink can read.": "Dit bestand is geen pdf die Vink kan lezen.",
  "The PDF is larger than 10 MB.": "De pdf is groter dan 10 MB.",
  "The PDF was deleted": "De pdf is verwijderd",
  "This Submission is approved": "Deze Inzending is goedgekeurd",
  "This Submission has no Form": "Deze Inzending heeft geen Formulier",
  "This Submission's Form can't be changed now": "Het Formulier van deze Inzending kan nu niet worden gewijzigd",
  "The Submission is already on this Form": "De Inzending staat al op dit Formulier",
  "This Submission can't be reviewed now": "Deze Inzending kan nu niet worden gecontroleerd",
  "This Submission can't be rejected now": "Deze Inzending kan nu niet worden afgewezen",
  "Only a Rejected Submission can be reopened": "Alleen een Afgewezen Inzending kan worden heropend",
  "This Submission's PDF is gone, so it can't be reopened":
    "De pdf van deze Inzending is weg, dus de Inzending kan niet worden heropend",
  "This Submission's data was deleted": "De gegevens van deze Inzending zijn verwijderd",
  "This Submission's data was already deleted": "De gegevens van deze Inzending zijn al verwijderd",
  "Only a failed Extraction can be retried": "Alleen een mislukte Extractie kan opnieuw worden geprobeerd",

  // Forms
  "A Form needs a name": "Een Formulier heeft een naam nodig",
  "The Review Threshold must be from 0 to 1": "De Controledrempel moet tussen 0 en 1 liggen",
  "Only a failed proposal can be retried": "Alleen een mislukt voorstel kan opnieuw worden geprobeerd",
  "This proposal can't be saved as a new Form": "Dit voorstel kan niet als nieuw Formulier worden opgeslagen",
  "This proposal doesn't extend a Form": "Dit voorstel vult geen bestaand Formulier aan",
  "This proposal has no sample to process": "Dit voorstel heeft geen voorbeeld om te verwerken",
  "Describe the document and the data you need first.": "Beschrijf eerst het document en de gegevens die je nodig hebt.",
  "The description is longer than 2000 characters.": "De beschrijving is langer dan 2000 tekens.",
  "Your Organisation has described 20 Forms in the last 24 hours. Try again later.":
    "Jullie organisatie heeft de afgelopen 24 uur al 20 Formulieren beschreven. Probeer het later opnieuw.",

  // Integrations and Deliveries
  "An Integration needs a name": "Een Koppeling heeft een naam nodig",
  "The endpoint must be an https URL": "Het endpoint moet een https-URL zijn",
  "Choose an Approved Submission of this Form": "Kies een Goedgekeurde Inzending van dit Formulier",
  "Only an Approved Submission can be test-sent": "Alleen een Goedgekeurde Inzending kan als test worden verstuurd",
  "Only a failed Delivery can be sent again": "Alleen een mislukte Levering kan opnieuw worden verstuurd",
  "Integration removed: this Delivery can't be sent again":
    "Koppeling verwijderd: deze Levering kan niet opnieuw worden verstuurd",
  "This Integration isn't a Webhook": "Deze Koppeling is geen Webhook",
  "An automation platform made this Webhook, so it stays attached to its own Form only. Delete the Webhook to stop it.":
    "Een automatiseringsplatform heeft deze Webhook gemaakt, dus hij blijft alleen aan zijn eigen Formulier gekoppeld. Verwijder de Webhook om dat te stoppen.",
  "Google Sheets isn't set up on this deployment": "Google Sheets is hier nog niet ingesteld",
  "This Google sign-in has expired. Try again.": "Deze aanmelding bij Google is verlopen. Probeer het opnieuw.",
  "This Integration has no account to reconnect": "Deze Koppeling heeft geen account om opnieuw te koppelen",
  "Excel isn't set up on this deployment": "Excel is hier nog niet ingesteld",
  "This Microsoft sign-in has expired. Try again.": "Deze aanmelding bij Microsoft is verlopen. Probeer het opnieuw.",
  "Vink is writing to this Integration right now. Try again in a moment.":
    "Vink schrijft nu naar deze Koppeling. Probeer het zo opnieuw.",

  // API Keys
  "An API Key needs a name": "Een API-sleutel heeft een naam nodig",
  "API Key not found": "API-sleutel niet gevonden",
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
    /^This PDF has (\d+) pages\. Vink reads up to (\d+) pages per PDF\.$/,
    (pages, max) => `Deze pdf heeft ${pages} pagina's. Vink leest maximaal ${max} pagina's per pdf.`,
  ],
  // The same, as worded in intake skip reasons stored before it said "per PDF".
  [
    /^This PDF has (\d+) pages\. Vink reads up to (\d+) pages per Submission\.$/,
    (pages, max) => `Deze pdf heeft ${pages} pagina's. Vink leest maximaal ${max} pagina's per pdf.`,
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
