"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  clearAnalyticsCookies,
  type Consent,
  OPEN_CONSENT_EVENT,
  readConsent,
  writeConsent,
} from "@/lib/consent";

/**
 * Consent Mode v2, basic (ticket 05): no Google tag is on the page until the
 * visitor accepts. Ads consent types stay denied and Google signals and ad
 * personalisation are off. Only the marketing root layout renders this, so
 * the app under /app never loads gtag.
 */
function loadGtag(gaId: string, cookieDomain: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js expects the `arguments` object itself.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  window.gtag("config", gaId, {
    cookie_domain: cookieDomain,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(script);
}

/** Records the choice server-side too (id, version, choice, time, locale; no IP). */
function logConsent(consent: Consent, locale: string) {
  const body = JSON.stringify({ ...consent, locale });
  try {
    navigator.sendBeacon?.("/api/consent", new Blob([body], { type: "application/json" }));
  } catch {
    // The cookie is the record of last resort.
  }
}

export function ConsentBanner({
  gaId,
  cookieDomain,
  locale,
}: {
  gaId: string | undefined;
  cookieDomain: string;
  locale: string;
}) {
  const t = useTranslations("cookies");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Nothing to ask when there's no GA to load.
    if (!gaId) return;
    const consent = readConsent();
    // Reading a cookie is only possible after hydration; pages stay static.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (consent === null) setOpen(true);
    else if (consent.analytics) loadGtag(gaId, cookieDomain);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, [gaId, cookieDomain]);

  if (!gaId || !open) return null;

  function choose(analytics: boolean) {
    const before = readConsent();
    const consent = writeConsent(analytics);
    logConsent(consent, locale);
    setOpen(false);
    if (analytics) {
      loadGtag(gaId!, cookieDomain);
    } else if (before?.analytics || window.gtag) {
      // A withdrawal: stop measuring, remove GA's cookies, and reload so the
      // loaded tag is gone.
      window.gtag?.("consent", "update", { analytics_storage: "denied" });
      clearAnalyticsCookies(cookieDomain);
      window.location.reload();
    }
  }

  return (
    <section
      role="region"
      aria-label={t("label")}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:left-6 sm:mx-0"
    >
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("body")}{" "}
        <Link href="/privacy" className="font-medium text-foreground underline underline-offset-3">
          {t("policy")}
        </Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={() => choose(false)}>
          {t("reject")}
        </Button>
        <Button variant="outline" size="lg" onClick={() => choose(true)}>
          {t("accept")}
        </Button>
      </div>
    </section>
  );
}

/** The footer's "Cookie settings": opens the banner again. */
export function CookieSettingsButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="text-left text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      {children}
    </button>
  );
}
