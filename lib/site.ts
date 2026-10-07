/** The public origin every absolute URL is built from, so a domain move is a config change. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3003").replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The site's host name, e.g. for GA's `cookie_domain` and default mailboxes. */
export const SITE_HOST = new URL(SITE_URL).hostname;

/** Vink's direct address, shown in the team block on Home and Contact. */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? `support@${SITE_HOST}`;

/** Where security problems are reported (Terms page, security.txt). */
export const SECURITY_EMAIL = process.env.SECURITY_EMAIL ?? `security@${SITE_HOST}`;

/** The product lives under its own root layout: links to it are plain `<a>`, never next/link. */
export const APP_PATH = "/app";
export const SIGN_UP_PATH = "/app/sign-up";

/** Vink's Chamber of Commerce number, shown in the footer (iDEAL requires it on the site). */
export const KVK_NUMBER = "57288135";

/** Who is behind Vink in law (an eenmanszaak), named only in Privacy and Terms. */
export const LEGAL_OWNER = "Rob van Baaren";
export const LEGAL_ADDRESS = "Zilverschoon, 7577 CB Oldenzaal";

/** Where privacy questions and data requests go (Privacy, Terms). */
export const PRIVACY_EMAIL = process.env.PRIVACY_EMAIL ?? `hi@${SITE_HOST}`;

// The payment party's own privacy policy (Privacy, Terms → Subprocessors).
export const STRIPE_PRIVACY = "https://stripe.com/privacy";
