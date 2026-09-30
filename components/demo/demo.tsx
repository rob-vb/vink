"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import type { ListedState } from "@/components/documents/labels";
import type { ReviewFilter } from "@/components/documents/review-view";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { StartFreeLink } from "@/components/marketing/cta-links";
import { trackSignUpClick } from "@/lib/analytics";
import { SIGN_UP_PATH } from "@/lib/site";
import { DemoAppFrame } from "./demo-app-frame";
import type { DemoDocumentId } from "./demo-papers";
import { DemoDocumentsScreen, DemoLabels, DemoReviewScreen, type ReviewHandlers } from "./demo-screens";
import { demoReducer, initialDocuments, valuesRead, type Locale } from "./demo-state";

const TOASTER = "vink-demo";

// When the visitor did something; only ever called from event handlers.
const stamp = () => Date.now();

/**
 * The clickable demo (Interactive demo, variant D): the app's Documents page
 * and review screen with five demo Documents, all in the browser. Nothing is
 * sent anywhere. When Needs Review is empty, a card shows the visitor's time
 * and counts, then Start free.
 */
export function Demo() {
  const locale = useLocale() as Locale;
  const t = useTranslations("demo");
  const [documents, dispatch] = useReducer(demoReducer, locale, initialDocuments);
  const [view, setView] = useState<DemoDocumentId | null>(null);
  const [tab, setTab] = useState<ListedState>("needs_review");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const waiting = documents.filter((d) => d.state === "needs_review");
  const document = view === null ? undefined : documents.find((d) => d.id === view);

  // Opening a Document or going back: keep the top of the demo in view.
  const moved = useRef(false);
  useEffect(() => {
    const element = frame.current;
    if (!moved.current) {
      moved.current = true;
      return;
    }
    if (element && element.getBoundingClientRect().top < 0) {
      element.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [view]);

  function open(id: string) {
    setView(id as DemoDocumentId);
    setPage(1);
    setSelected(null);
    setFilter("all");
    setStartedAt((at) => at ?? stamp());
  }

  function backToTable() {
    setView(null);
  }

  function startOver() {
    dispatch({ type: "reset", locale });
    setView(null);
    setTab("needs_review");
    setStartedAt(null);
    setFinishedAt(null);
    setClosed(false);
    toast.dismiss();
  }

  const on = (documentId: DemoDocumentId) => ({ documentId, at: stamp() });

  const handlers = (documentId: DemoDocumentId): ReviewHandlers => ({
    onBack: backToTable,
    onPageChange: setPage,
    onSelect: (id, pages) => {
      setSelected(id);
      // Turns to the page the value was read on. The app has no region highlight, so neither has this.
      if (pages.length > 0) setPage(pages[0]);
    },
    onFilterChange: setFilter,
    onCorrect: (fieldValueId, value) => dispatch({ type: "correct", ...on(documentId), fieldValueId, value }),
    onCheck: (fieldValueId) => dispatch({ type: "check", ...on(documentId), fieldValueId }),
    onUndo: (fieldValueId) => dispatch({ type: "undo", documentId, fieldValueId }),
    onConfirmEntries: (listKey) => dispatch({ type: "confirmEntries", ...on(documentId), listKey }),
    onUndoConfirmEntries: (listKey) => dispatch({ type: "undoConfirmEntries", ...on(documentId), listKey }),
    onRemoveEntry: (listKey, entry) => dispatch({ type: "removeEntry", ...on(documentId), listKey, entry }),
    onRestoreEntry: (listKey, entry) => dispatch({ type: "restoreEntry", ...on(documentId), listKey, entry }),
    onAddEntry: (listKey) => dispatch({ type: "addEntry", ...on(documentId), listKey }),
    onApprove: (next) => {
      const at = stamp();
      const filename = documents.find((d) => d.id === documentId)?.filename ?? "";
      dispatch({ type: "approve", documentId, at });
      toast.success(t("toast.approved", { filename }), { toasterId: TOASTER });
      const rest = waiting.filter((d) => d.id !== documentId);
      if (rest.length === 0) setFinishedAt(at);
      if (next && rest.length > 0) {
        open(rest[0].id);
        return;
      }
      if (next) toast.info(t("toast.nothingElse"), { toasterId: TOASTER });
      setTab("needs_review");
      backToTable();
    },
  });

  const checked = documents.reduce(
    (n, d) =>
      n +
      d.fieldValues.filter((f) => f.review).length +
      d.lists.reduce(
        (m, l) => m + (l.complete ? 1 : 0) + l.entries.reduce((k, e) => k + e.fieldValues.filter((f) => f.review).length, 0),
        0,
      ),
    0,
  );
  const seconds =
    startedAt !== null && finishedAt !== null ? Math.max(1, Math.round((finishedAt - startedAt) / 1000)) : 0;
  const time =
    seconds < 60
      ? t("done.seconds", { s: seconds })
      : t("done.minutes", { m: Math.floor(seconds / 60), s: seconds % 60 });
  const showDone = view === null && waiting.length === 0 && !closed;

  return (
    <DemoLabels>
      <div
        ref={frame}
        className="relative scroll-mt-20 overflow-clip rounded-xl border bg-background text-foreground shadow-[0_1px_2px_rgba(15,30,54,.06),0_24px_48px_-24px_rgba(15,30,54,.35)]"
        role="region"
        aria-label={t("frame.label")}
      >
        <DemoAppFrame
          organisation={t("frame.organisation")}
          nav={{
            documents: t("frame.documents"),
            forms: t("frame.forms"),
            integrations: t("frame.integrations"),
            members: t("frame.members"),
          }}
          demoData={t("frame.demoData")}
          startOver={t("frame.startOver")}
          onDocuments={backToTable}
          onStartOver={startOver}
        >
          <div className="min-h-[34rem]">
            {document ? (
              <DemoReviewScreen
                document={document}
                page={page}
                selected={selected}
                filter={filter}
                handlers={handlers(document.id)}
              />
            ) : (
              <DemoDocumentsScreen
                documents={documents}
                tab={tab}
                onTabChange={setTab}
                onOpen={open}
                onAccountOnly={(what) =>
                  toast.info(what === "upload" ? t("toast.ownAccount") : t("toast.extracting"), {
                    toasterId: TOASTER,
                    action:
                      what === "upload"
                        ? {
                            label: t("done.startFree"),
                            // The app has its own root layout: a full page load.
                            onClick: () => {
                              trackSignUpClick("demo-upload");
                              window.location.assign(SIGN_UP_PATH);
                            },
                          }
                        : undefined,
                  })
                }
              />
            )}
          </div>
        </DemoAppFrame>

        {showDone && (
          <div className="absolute inset-0 top-24 z-30 flex items-start justify-center bg-background/70 p-4 backdrop-blur-[2px] sm:top-14 sm:items-center">
            <div
              role="dialog"
              aria-labelledby="demo-done-title"
              className="w-full max-w-md animate-in rounded-xl border bg-card p-6 text-card-foreground shadow-lg duration-300 fade-in-0 zoom-in-95"
            >
              <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                {t("done.eyebrow")}
              </p>
              <h3 id="demo-done-title" className="mt-2 text-xl font-semibold tracking-tight text-balance">
                {t("done.title")}
              </h3>
              <dl className="mt-5 grid grid-cols-3 gap-3 border-y py-4">
                {[
                  [time, t("done.time")],
                  [String(checked), t("done.checked")],
                  [String(valuesRead(documents)), t("done.read")],
                ].map(([value, label]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">{t("done.body")}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {/* The app has its own root layout: a full page load, not a client-side Link. */}
                <Button nativeButton={false} render={<StartFreeLink location="demo-done" />}>
                  {t("done.startFree")}
                </Button>
                <Button variant="outline" onClick={() => setClosed(true)}>
                  {t("done.lookAround")}
                </Button>
                <Button variant="ghost" onClick={startOver}>
                  {t("done.startOver")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toaster id={TOASTER} />
    </DemoLabels>
  );
}
