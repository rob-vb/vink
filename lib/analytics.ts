// GA4 events from the marketing site. Before consent there is no gtag on the
// page, so these calls do nothing.

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

export function track(event: string, params: Record<string, string> = {}) {
  window.gtag?.("event", event, { ...params, transport_type: "beacon" });
}

/** A click on "Start free" or any other sign-up CTA, with where on the site it was. */
export function trackSignUpClick(location: string) {
  track("sign_up_click", { cta_location: location, page_path: window.location.pathname });
}

export function trackLoginClick(location: string) {
  track("login_click", { cta_location: location, page_path: window.location.pathname });
}
