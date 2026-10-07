// The Organisation name typed at sign-up rides along in the mailed link's
// callback URL. Better Auth's magic link decodes that URL twice, which broke
// names with "&", "+" or "%" ("Bakker & Zonen" arrived as "Bakker"). Base64url
// has none of those characters, so the name survives any number of decodes.

/** Where a new sign-up lands after its mailed link: the welcome page, carrying the Organisation name. */
export function welcomePath(organisation: string): string {
  const name = organisation.trim();
  if (name === "") return "/app/welcome";
  const binary = String.fromCharCode(...new TextEncoder().encode(name));
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/app/welcome?org=${encoded}`;
}

/** The Organisation name from the welcome page's search params, or "" when there is none. */
export function organisationFromWelcome(params: Record<string, string | string[] | undefined>): string {
  const { org, organisation } = params;
  if (typeof org === "string") {
    try {
      const binary = atob(org.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    } catch {
      return "";
    }
  }
  // Links mailed before `org` existed carry the name as plain text.
  return typeof organisation === "string" ? organisation.trim() : "";
}
