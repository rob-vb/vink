const YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * `/.well-known/security.txt` (RFC 9116): where to report a vulnerability.
 * `contact` is an address (`security@…`) or a URL; it defaults to
 * `security@<site host>`, so a domain move is a config change.
 */
export function securityTxt({
  siteUrl,
  contact,
  now,
}: {
  siteUrl: string;
  contact?: string;
  now: Date;
}) {
  const address = contact?.trim() || `security@${new URL(siteUrl).hostname}`;
  const contactUri = /^[a-z][a-z0-9+.-]*:/i.test(address) ? address : `mailto:${address}`;
  return [
    `Contact: ${contactUri}`,
    `Expires: ${new Date(now.getTime() + YEAR).toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en, nl",
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    "",
  ].join("\n");
}
