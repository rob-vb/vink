import type { DocumentsLabels } from "@/components/documents/labels";
import type { SplitInfo } from "@/convex/lib/eventInfo";

function pagesLabel(pages: number[]) {
  return pages.length === 1 ? `pagina ${pages[0]}` : `pagina's ${pages.join(", ")}`;
}

const SPLIT_ANSWERS = {
  together: "één zaak",
  cover_note: "aparte papieren, met de tekst alleen als begeleidende tekst",
  apart: "aparte papieren",
};

function splitReason(split: SplitInfo): string {
  return `Vink wist niet zeker of deze e-mail één zaak is of ${split.documents} aparte papieren (${split.percent}% zeker van "${SPLIT_ANSWERS[split.answer]}"), dus er zijn ${split.documents} Inzendingen gemaakt. Controleer of ze bij elkaar horen.`;
}

/**
 * The Documents page and review screen in Dutch, for the app and the Dutch demo.
 * The English words are `englishLabels` in components/documents/labels.tsx,
 * the source these follow.
 */
export const dutchLabels: DocumentsLabels = {
  documents: {
    title: "Inbox",
    subtitle: "Statuswijzigingen verschijnen hier zodra ze gebeuren.",
    tabs: {
      needs_review: "Te controleren",
      no_form: "Geen Formulier",
      approved: "Goedgekeurd",
      extraction_failed: "Mislukt",
      rejected: "Afgewezen",
    },
    empty: {
      needs_review: "Er wacht niets op controle.",
      no_form: "Elke Inzending heeft een Formulier gevonden.",
      approved: "Er zijn nog geen Inzendingen goedgekeurd.",
      extraction_failed: "Er zijn geen Extracties mislukt.",
      rejected: "Er zijn geen Inzendingen afgewezen.",
    },
  },
  table: {
    document: "Inzending",
    form: "Formulier",
    pages: "Pagina's",
    uploadedBy: "Geüpload door",
    uploaded: "Geüpload",
    retry: "Opnieuw",
    autoSend: "Auto-Send",
    noDocuments: "Geen Inzendingen",
    deleted: "Verwijderd · ",
    rejectedBy: "Afgewezen door",
  },
  review: {
    back: "Inbox",
    states: {
      extracting: "Wordt gelezen",
      needs_review: "Te controleren",
      approved: "Goedgekeurd",
      extraction_failed: "Extractie mislukt",
      no_form: "Geen Formulier",
      rejected: "Afgewezen",
      deleted: "Verwijderd",
    },
    pageCount: (n) => (n === 1 ? "pagina" : "pagina's"),
    kinds: { email: "e-mail", image: "foto" },
    reviewThreshold: "Controledrempel",
    approved: "Goedgekeurd",
    approvedBy: (mode, by) => (mode === "auto" ? "Automatisch" : `Door ${by}`),
    noForm: {
      title: "Geen Formulier past bij deze Inzending",
      text: "Vink vond geen Formulier dat past, dus er valt nog niets te controleren. Kies hierboven met Formulier wijzigen een Formulier om in te vullen, of wijs de Inzending af met Afwijzen. De items zijn wel geteld.",
      empty: "Nog geen velden. Ze verschijnen zodra de Inzending een Formulier heeft.",
    },
    split: {
      title: "Vink heeft deze e-mail gesplitst",
      // The specific reason already says what Vink was unsure of; the general sentence is only a fallback.
      text: (reason) =>
        reason.trim() ||
        "Vink wist niet zeker of de delen van deze e-mail bij elkaar horen, dus het maakte aparte Inzendingen. Controleer ze goed.",
      reason: splitReason,
    },
    fields: "Velden",
    allFields: "Alle velden",
    needsReviewOnly: "Alleen te controleren",
    nothingLeft: "Er is niets meer te controleren.",
    everythingChecked: "Alles is gecontroleerd.",
    valuesNeedReview: (n) =>
      n === 1
        ? "1 waarde moet gecontroleerd worden voor Goedkeuring."
        : `${n} waarden moeten gecontroleerd worden voor Goedkeuring.`,
    approveAndNext: "Goedkeuren en volgende",
    approveLeft: (n) => `Goedkeuren (nog ${n})`,
    approveAndSend: "Goedkeuren en versturen",
    deliveries: "Leveringen",
    history: "Geschiedenis",
    events: {
      uploaded: "Geüpload",
      extracted: "Gelezen",
      extraction_failed: "Lezen mislukt",
      extraction_retried: "Opnieuw gestart met lezen",
      rejected: "Afgewezen",
      reopened: "Heropend",
      form_changed: "Formulier gewijzigd",
      routed: "Formulier gekozen",
      no_form: "Geen Formulier past",
      mail_split: "E-mail gesplitst",
      data_deleted: "Gegevens verwijderd",
      deleted: "Verwijderd",
      corrected: "Gecorrigeerd",
      entry_added: "Regel toegevoegd",
      entry_removed: "Regel verwijderd",
      entry_restored: "Regel teruggezet",
      entries_confirmed: "Regels bevestigd als compleet",
      entries_unconfirmed: "Regels niet langer bevestigd",
      approved: "Goedgekeurd",
    },
    eventDetail: (info) => {
      switch (info.code) {
        case "routed":
          return `${info.form} (${info.percent}%)`;
        case "no_forms":
          return "De Organisatie heeft geen Formulieren";
        case "nothing_read":
          return "Er kon niets worden gelezen";
        case "no_fit":
          return info.form === undefined ? "Het systeem koos geen van de Formulieren" : `Past niet bij ${info.form}`;
        case "form_changed":
          return `${info.from ?? "Geen Formulier"} → ${info.to}`;
        case "mail_split":
          return splitReason(info.split);
      }
    },
  },
  panes: {
    email: {
      from: "Van",
      subject: "Onderwerp",
      date: "Datum",
      noSubject: "(geen onderwerp)",
      body: "E-mail",
      attachments: (n) => `Bijlagen (${n})`,
      attachment: (name, pages) =>
        pages === null ? name : `${name}, ${pages} ${pages === 1 ? "pagina" : "pagina's"}`,
      noBody: "Deze e-mail heeft geen tekst.",
      sourceFound: "De tekst waaruit deze waarde is gelezen is gemarkeerd.",
      failed: "De e-mail kon niet worden geladen.",
      attachmentFailed: "De bijlage kon niet worden geladen.",
      switcher: "E-mail en bijlagen",
    },
    image: {
      zoomIn: "Inzoomen",
      zoomOut: "Uitzoomen",
      fit: "Passend op breedte",
      zoomHint: "Zoom met de knoppen, Ctrl en het muiswiel, knijpen, of + en −.",
      failed: "De foto kon hier niet worden getoond.",
      heicTitle: "Deze browser kan geen HEIC-foto's tonen",
      heicText: "Vink leest de foto wel. Download hem om zelf te kijken.",
      download: "Download de foto",
      alt: (name) => `De foto ${name}`,
      zoom: "Foto met zoom",
    },
  },
  field: {
    reasons: {
      below_threshold: "Onder de drempel",
      required_empty: "Verplicht maar leeg",
      type_mismatch: "Past niet bij het type",
      unsure: "Onzeker gelezen",
      conflicting: "Tegenstrijdige lezingen",
    },
    signals: { match: "Match", fit: "Fit", support: "Support" },
    lowestSignal: "laagste signaal",
    readOn: (pages) => `Gelezen op ${pagesLabel(pages)}`,
    notFound: "Niet gevonden in de Inzending",
    filledByHand: "Met de hand ingevuld",
    noValue: "Geen waarde",
    yes: "Ja",
    no: "Nee",
    needsReview: "Te controleren",
    corrected: "Gecorrigeerd",
    checked: "Gecontroleerd",
    valueIsRight: "Waarde klopt",
    undo: "Ongedaan maken",
    confidence: (confidence, threshold) => `Zekerheid ${confidence}, drempel ${threshold}`,
  },
  list: {
    reasons: {
      below_threshold: "Er kunnen regels ontbreken of verzonnen zijn",
      required_empty: "Verplicht, maar er zijn geen regels",
      type_mismatch: "Past niet bij het type",
      unsure: "Onzeker gelezen",
      conflicting: "Tegenstrijdige lezingen",
    },
    entries: (n) => `${n} ${n === 1 ? "regel" : "regels"} · zijn alle regels gevonden?`,
    complete: "Compleet",
    entriesComplete: "Regels zijn compleet",
    undo: "Ongedaan maken",
    entry: (n) => `Regel ${n}`,
    addedByHand: "Met de hand toegevoegd",
    restore: "Terugzetten",
    remove: "Verwijderen",
    removeEntry: (n) => `Regel ${n} verwijderen`,
    addEntry: "Regel toevoegen",
  },
  delivery: {
    states: {
      pending: "Wordt verstuurd",
      retrying: "Nieuwe poging",
      delivered: "Afgeleverd",
      failed: "Mislukt",
    },
    nextTry: "Volgende poging",
    noAttempt: "Nog geen poging.",
  },
};
