import type { DocumentsLabels } from "@/components/documents/labels";

function pagesLabel(pages: number[]) {
  return pages.length === 1 ? `pagina ${pages[0]}` : `pagina's ${pages.join(", ")}`;
}

/**
 * The Documents page and review screen in Dutch, for the app and the Dutch demo.
 * The English words are `englishLabels` in components/documents/labels.tsx,
 * the source these follow.
 */
export const dutchLabels: DocumentsLabels = {
  documents: {
    title: "Documenten",
    subtitle: "Statuswijzigingen verschijnen hier zodra ze gebeuren.",
    tabs: {
      needs_review: "Te controleren",
      approved: "Goedgekeurd",
      extraction_failed: "Mislukt",
      rejected: "Afgewezen",
    },
    empty: {
      needs_review: "Er wacht niets op controle.",
      approved: "Er zijn nog geen Documenten goedgekeurd.",
      extraction_failed: "Er zijn geen Extracties mislukt.",
      rejected: "Er zijn geen Documenten afgewezen.",
    },
  },
  table: {
    document: "Document",
    form: "Formulier",
    pages: "Pagina's",
    uploadedBy: "Geüpload door",
    uploaded: "Geüpload",
    retry: "Opnieuw",
    autoSend: "Auto-Send",
    noDocuments: "Geen Documenten",
    deleted: "Verwijderd · ",
    rejectedBy: "Afgewezen door",
  },
  review: {
    back: "Documenten",
    states: {
      extracting: "Wordt gelezen",
      needs_review: "Te controleren",
      approved: "Goedgekeurd",
      extraction_failed: "Extractie mislukt",
      no_form: "Geen formulier",
      rejected: "Afgewezen",
      deleted: "Verwijderd",
    },
    pageCount: (n) => (n === 1 ? "pagina" : "pagina's"),
    reviewThreshold: "Controledrempel",
    approved: "Goedgekeurd",
    approvedBy: (mode, by) => (mode === "auto" ? "Automatisch" : `Door ${by}`),
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
      no_form: "Geen formulier past",
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
  },
  field: {
    reasons: {
      below_threshold: "Onder de drempel",
      required_empty: "Verplicht maar leeg",
      type_mismatch: "Past niet bij het type",
      unsure: "Onzeker gelezen",
      conflicting: "Tegenstrijdige lezingen",
    },
    signals: { match: "Match", fit: "Jev fit", support: "Jev support" },
    lowestSignal: "laagste signaal",
    readOn: (pages) => `Gelezen op ${pagesLabel(pages)}`,
    notFound: "Niet gevonden op het Document",
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
