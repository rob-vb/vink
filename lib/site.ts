/** The public origin every absolute URL is built from, so a domain move is a config change. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3003").replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
