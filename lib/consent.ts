// The visitor's cookie choice (ticket 05): one first-party cookie on the site
// host, Path=/, kept 6 months, read only in the browser so pages stay static.
// It is also the consent record Google's EU User Consent Policy asks for:
// a random id, the banner version, the choice and when it was made.

export const CONSENT_COOKIE = "vink_consent";
/** Bump when the purposes change (for example ads): everyone is asked again. */
export const CONSENT_VERSION = 1;
const MAX_AGE = 60 * 60 * 24 * 182;

export type Consent = { v: number; id: string; analytics: boolean; ts: string };

/** Opens the banner again from anywhere (the footer's "Cookie settings"). */
export const OPEN_CONSENT_EVENT = "vink:cookie-settings";

export function readConsent(): Consent | null {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const consent = JSON.parse(decodeURIComponent(raw)) as Consent;
    return consent.v === CONSENT_VERSION && typeof consent.analytics === "boolean" ? consent : null;
  } catch {
    return null;
  }
}

export function writeConsent(analytics: boolean): Consent {
  const consent: Consent = {
    v: CONSENT_VERSION,
    id: readConsent()?.id ?? crypto.randomUUID(),
    analytics,
    ts: new Date().toISOString(),
  };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  return consent;
}

/** Removes Google Analytics' own cookies after a withdrawal. */
export function clearAnalyticsCookies(cookieDomain: string) {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name === "_ga" || name.startsWith("_ga_")) {
      for (const domain of ["", `; Domain=${cookieDomain}`]) {
        document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
      }
    }
  }
}
